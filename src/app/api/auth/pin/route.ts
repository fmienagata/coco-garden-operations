import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import User from '../../../../lib/models/User';
import { connectMongo } from '../../../../lib/db/mongo';
import { AUTH_COOKIE, createSession } from '../../../../lib/auth';
import { verifyPassword } from '../../../../lib/passwords';
import { readJson, apiResponse, UserError } from '../../../../lib/api';
import { requireDevice } from '../../../../lib/devices';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// La liste d'équipe s'affiche sur l'écran de reprise de poste : on choisit son nom,
// puis on saisit son code. Cela évite d'imposer des PIN uniques dans l'établissement.
async function handleGET(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    const staff = await User.find({
      restaurantId: device.restaurantId,
      active: true,
      deletedAt: null,
      authType: 'password',
      pinHash: { $ne: null },
    })
      .select('login name role')
      .sort({ name: 1 })
      .lean();
    return Response.json(
      { device: { name: device.name, kind: device.kind, numberPrefix: device.numberPrefix }, staff },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    // Un PIN n'a que quelques milliers de combinaisons : il n'est acceptable que
    // depuis un poste enrôlé, et derrière un verrouillage persisté en base.
    const device = await requireDevice(request);
    const { login, pin } = await readJson(request);
    if (typeof login !== 'string' || typeof pin !== 'string') throw new UserError('Code incorrect.', 401);

    await connectMongo();
    const user = (await User.findOne({
      restaurantId: device.restaurantId,
      login: login.trim(),
      active: true,
      deletedAt: null,
      authType: 'password',
    }).select('+pinHash +pinFailedAttempts +pinLockedUntil')) as any;

    // Même réponse pour un compte inconnu et un code faux : rien ne doit révéler qui existe.
    if (!user || !user.pinHash) throw new UserError('Code incorrect.', 401);
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const minutes = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60000);
      throw new UserError(
        `Compte bloqué ${minutes} minute${minutes > 1 ? 's' : ''}. Utilisez le mot de passe ou voyez un administrateur.`,
        429,
      );
    }

    if (!verifyPassword(pin, user.pinHash)) {
      const attempts = (user.pinFailedAttempts || 0) + 1;
      const locked = attempts >= MAX_ATTEMPTS;
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            pinFailedAttempts: locked ? 0 : attempts,
            pinLockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
          },
        },
      );
      throw new UserError(
        locked ? `Trop d’essais. Compte bloqué ${LOCK_MINUTES} minutes.` : 'Code incorrect.',
        locked ? 429 : 401,
      );
    }

    await User.updateOne({ _id: user._id }, { $set: { pinFailedAttempts: 0, pinLockedUntil: null } });
    (await cookies()).set(
      AUTH_COOKIE,
      createSession(user.login, user.restaurantId, user.role, user.sessionVersion || 0),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60,
        path: '/',
      },
    );
    return Response.json({ success: true, login: user.login, name: user.name, role: user.role });
  });
}

export const GET = withAudit('GET /api/auth/pin', handleGET);
export const POST = withAudit('POST /api/auth/pin', handlePOST);

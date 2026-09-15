import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Device from '../../../../lib/models/Device';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';
import { issueDeviceToken } from '../../../../lib/devices';

const ADMIN = 'L’enrôlement des postes est réservé à l’administrateur.';
const deviceFields = '_id name kind numberPrefix active lastSeenAt createdAt';

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: ADMIN });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const body = await readJson(request);
    const changes: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60)
        throw new UserError('Nom de poste invalide.');
      changes.name = body.name.trim();
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw new UserError('Statut invalide.');
      changes.active = body.active;
    }
    // Un poste perdu ou volé doit pouvoir être coupé sans être supprimé : on révoque son jeton.
    let token: string | undefined;
    if (body.rotateToken === true) {
      const issued = issueDeviceToken();
      changes.tokenHash = issued.tokenHash;
      token = issued.token;
    }
    if (!Object.keys(changes).length) throw new UserError('Aucune modification fournie.');
    await connectMongo();
    const device = (await Device.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId, deletedAt: null },
      { $set: changes },
      { new: true },
    )
      .select(deviceFields)
      .lean()) as Record<string, unknown> | null;
    if (!device) throw new UserError('Poste introuvable.', 404);
    return Response.json(token ? { ...device, token } : device);
  });
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: ADMIN });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    // Retrait logique : le préfixe reste réservé pour que les numéros déjà émis restent lisibles.
    const device = await Device.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId, deletedAt: null },
      { $set: { active: false, deletedAt: new Date(), tokenHash: 'revoked' } },
      { new: true },
    );
    if (!device) throw new UserError('Poste introuvable.', 404);
    return new Response(null, { status: 204 });
  });
}

export const PATCH = withAudit('PATCH /api/devices/[id]', handlePATCH);
export const DELETE = withAudit('DELETE /api/devices/[id]', handleDELETE);

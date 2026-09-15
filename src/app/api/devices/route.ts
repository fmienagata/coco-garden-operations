import { withAudit } from '../../../lib/audit';
import Device from '../../../lib/models/Device';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../lib/api';
import { issueDeviceToken, normalizePrefix } from '../../../lib/devices';

const ADMIN = 'L’enrôlement des postes est réservé à l’administrateur.';
const deviceFields = '_id name kind numberPrefix active lastSeenAt createdAt';

async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: ADMIN });
    await connectMongo();
    return Response.json(
      await Device.find({ restaurantId: session.restaurantId, deletedAt: null })
        .select(deviceFields)
        .sort({ active: -1, name: 1 })
        .lean(),
    );
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: ADMIN });
    const body = await readJson(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60)
      throw new UserError('Nom de poste requis (60 caractères maximum).');
    if (!['caisse', 'salle', 'cuisine'].includes(body.kind)) throw new UserError('Type de poste invalide.');
    const numberPrefix = normalizePrefix(body.numberPrefix);
    const { token, tokenHash } = issueDeviceToken();
    await connectMongo();
    if (await Device.exists({ restaurantId: session.restaurantId, numberPrefix, deletedAt: null }))
      throw new UserError('Ce préfixe est déjà utilisé par un autre poste.', 409);
    const device = await Device.create({
      restaurantId: session.restaurantId,
      name: body.name.trim(),
      kind: body.kind,
      numberPrefix,
      tokenHash,
    });
    const created = (await Device.findById(device._id).select(deviceFields).lean()) as Record<string, unknown>;
    // Le jeton n'est lisible qu'ici : la base n'en garde que l'empreinte.
    return Response.json({ ...created, token }, { status: 201 });
  });
}

export const GET = withAudit('GET /api/devices', handleGET);
export const POST = withAudit('POST /api/devices', handlePOST);

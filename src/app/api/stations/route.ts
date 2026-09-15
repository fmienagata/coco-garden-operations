import { withAudit } from '../../../lib/audit';
import PreparationStation from '../../../lib/models/PreparationStation';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../lib/api';
import { validateStation, STATION_ADMIN, STATION_FIELDS } from '../../../lib/stations';

// Lecture ouverte à la cuisine : un écran doit pouvoir savoir quels postes existent.
async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    await connectMongo();
    return Response.json(await PreparationStation.find({ restaurantId: session.restaurantId }).select(STATION_FIELDS).sort({ isDefault: -1, name: 1 }).lean());
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: STATION_ADMIN });
    const changes = validateStation(await readJson(request), true);
    await connectMongo();
    if (await PreparationStation.exists({ restaurantId: session.restaurantId, name: changes.name })) throw new UserError('Un poste porte déjà ce nom.', 409);
    // Un seul poste par défaut : deux filets de sécurité produiraient des bons en double.
    if (changes.isDefault) await PreparationStation.updateMany({ restaurantId: session.restaurantId }, { $set: { isDefault: false } });
    const station = await PreparationStation.create({ restaurantId: session.restaurantId, ...changes });
    return Response.json(await PreparationStation.findById(station._id).select(STATION_FIELDS).lean(), { status: 201 });
  });
}

export const GET = withAudit("GET /api/stations", handleGET);
export const POST = withAudit("POST /api/stations", handlePOST);

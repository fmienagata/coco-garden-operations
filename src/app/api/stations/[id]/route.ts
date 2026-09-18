import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import PreparationStation from '../../../../lib/models/PreparationStation';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';
import { validateStation, STATION_ADMIN, STATION_FIELDS } from '../../../../lib/stations';

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: STATION_ADMIN });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const changes = validateStation(await readJson(request), false);
    if (!Object.keys(changes).length) throw new UserError('Aucune modification fournie.');
    await connectMongo();
    if (changes.isDefault)
      await PreparationStation.updateMany(
        { restaurantId: session.restaurantId, _id: { $ne: id } },
        { $set: { isDefault: false } },
      );
    const station = await PreparationStation.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId },
      { $set: changes },
      { new: true, runValidators: true },
    )
      .select(STATION_FIELDS)
      .lean();
    if (!station) throw new UserError('Poste introuvable.', 404);
    return Response.json(station);
  });
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: STATION_ADMIN });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const station = await PreparationStation.findOneAndDelete({ _id: id, restaurantId: session.restaurantId });
    if (!station) throw new UserError('Poste introuvable.', 404);
    return new Response(null, { status: 204 });
  });
}

export const PATCH = withAudit('PATCH /api/stations/[id]', handlePATCH);
export const DELETE = withAudit('DELETE /api/stations/[id]', handleDELETE);

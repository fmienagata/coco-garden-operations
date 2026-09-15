import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import DeliveryZone from '../../../../lib/models/DeliveryZone';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';

async function handlePUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur' });
    const patch = await readJson(request);
    if (patch.fee !== undefined && (!Number.isInteger(patch.fee) || patch.fee < 0))
      throw new UserError('Tarif entier en FCFA requis');
    if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim()))
      throw new UserError('Nom de zone requis');
    if (patch.active !== undefined && typeof patch.active !== 'boolean') throw new UserError('Disponibilité invalide');
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    // Liste blanche : sans elle, un $set libre permettrait de déplacer la zone vers un autre restaurantId.
    const changes: Record<string, unknown> = {};
    for (const field of ['name', 'fee', 'active', 'sortOrder'])
      if (patch[field] !== undefined) changes[field] = field === 'name' ? patch.name.trim() : patch[field];
    if (!Object.keys(changes).length) throw new UserError('Aucune modification fournie.');
    await connectMongo();
    const zone = await DeliveryZone.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId },
      { $set: changes },
      { new: true, runValidators: true },
    ).lean();
    if (!zone) throw new UserError('Zone introuvable', 404);
    return Response.json(zone);
  });
}

export const PUT = withAudit('PUT /api/delivery-zones/[id]', handlePUT);

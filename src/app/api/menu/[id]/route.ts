import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import MenuItem from '../../../../lib/models/MenuItem';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';

// Champs modifiables depuis la Carte. itemCode et restaurantId sont des invariants : jamais éditables.
const EDITABLE = ['category', 'name', 'description', 'price', 'variants', 'imageUrl', 'active', 'sortOrder'];

async function handlePUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur' });
    const patch = await readJson(request);
    if (patch.active !== undefined && typeof patch.active !== 'boolean')
      throw new UserError('Availability must be a boolean');
    if (patch.price !== undefined && (!Number.isInteger(patch.price) || patch.price < 0))
      throw new UserError('Price must be a whole CFA amount');
    if (
      patch.variants !== undefined &&
      (!Array.isArray(patch.variants) ||
        !patch.variants.every(
          (variant: any) =>
            typeof variant.label === 'string' &&
            variant.label.trim() &&
            Number.isInteger(variant.price) &&
            variant.price >= 0,
        ))
    )
      throw new UserError('Invalid price variants');
    const changes: Record<string, unknown> = {};
    for (const field of EDITABLE) if (patch[field] !== undefined) changes[field] = patch[field];
    if (!Object.keys(changes).length) throw new UserError('Aucune modification fournie.');
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const item = await MenuItem.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId },
      { $set: changes },
      { new: true, runValidators: true },
    ).lean();
    if (!item) throw new UserError('Not found', 404);
    return Response.json(item);
  });
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur' });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const item = await MenuItem.findOneAndDelete({ _id: id, restaurantId: session.restaurantId });
    if (!item) throw new UserError('Not found', 404);
    return Response.json({ success: true });
  });
}

export const PUT = withAudit('PUT /api/menu/[id]', handlePUT);
export const DELETE = withAudit('DELETE /api/menu/[id]', handleDELETE);

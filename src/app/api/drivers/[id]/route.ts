import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Driver from '../../../../lib/models/Driver';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';

async function handlePUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'livraison' });
    const { available } = await readJson(request);
    if (typeof available !== 'boolean') throw new UserError('Available must be a boolean');
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const driver = await Driver.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId },
      { $set: { available } },
      { new: true },
    ).lean();
    if (!driver) throw new UserError('Driver not found', 404);
    return Response.json(driver);
  });
}

export const PUT = withAudit('PUT /api/drivers/[id]', handlePUT);

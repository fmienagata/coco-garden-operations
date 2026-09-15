import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Order from '../../../../lib/models/Order';
import Driver from '../../../../lib/models/Driver';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';

// `from` rend le statut de départ explicite et sert de garde atomique à la mise à jour.
const transitions: Record<string, { from: string; status: string; field: string }> = {
  assign: { from: 'ready', status: 'driver_assigned', field: 'driverAssignedAt' },
  pickup: { from: 'driver_assigned', status: 'in_delivery', field: 'pickedUpAt' },
  deliver: { from: 'in_delivery', status: 'completed', field: 'deliveredAt' },
};

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'livraison' });
    const { action, driverId } = await readJson(request);
    const transition = transitions[action];
    if (!transition) throw new UserError('Invalid delivery action');
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery' }).lean() as { _id: unknown; status: string; __v: number } | null;
    if (!order) throw new UserError('Delivery order not found', 404);
    if (order.status !== transition.from) throw new UserError(action === 'assign' ? 'Only ready orders can be assigned' : 'Invalid delivery transition', 409);

    const now = new Date();
    const changes: Record<string, unknown> = { status: transition.status, [transition.field]: now };
    if (action === 'assign') {
      const driver = await Driver.findOne({ _id: mongoose.isValidObjectId(driverId) ? driverId : null, restaurantId: session.restaurantId, active: true, available: true }).lean() as { _id: unknown; name: string; phone: string } | null;
      if (!driver) throw new UserError('Active driver not found');
      changes.driverId = String(driver._id);
      changes.driverName = driver.name;
      changes.driverPhone = driver.phone;
    }
    if (action === 'deliver') changes.completedAt = now;

    // Deux affectations simultanées ne doivent pas s'écraser : la condition porte sur le statut et sur __v.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, restaurantId: session.restaurantId, status: transition.from, __v: order.__v },
      { $set: changes, $inc: { __v: 1 } },
      { new: true },
    ).lean();
    if (!updated) throw new UserError('Livraison modifiée entre-temps. Actualisez avant de réessayer.', 409);
    return Response.json(updated);
  });
}

export const POST = withAudit("POST /api/delivery/[id]", handlePOST);

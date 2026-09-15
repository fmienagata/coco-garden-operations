import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Settlement from '../../../../lib/models/Settlement';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'La suppression d’une commande est réservée à l’administrateur.' });
    await connectMongo();
    const { id } = await readJson(request);
    if (!id || !mongoose.isValidObjectId(id)) throw new UserError('id required');
    if (await Settlement.exists({ restaurantId: session.restaurantId, orderId: String(id) })) throw new UserError('Une commande avec un historique de pilotage ne peut pas être supprimée.', 409);
    if (await Order.exists({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'dine_in' })) throw new UserError('Utilisez le module Salle.', 409);
    const deleted = await Order.findOneAndDelete({ _id: id, restaurantId: session.restaurantId });
    if (!deleted) throw new UserError('Not found', 404);
    return Response.json({ success: true });
  });
}

export const POST = withAudit("POST /api/orders/delete", handlePOST);

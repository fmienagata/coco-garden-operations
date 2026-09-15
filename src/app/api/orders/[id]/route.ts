import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Settlement from '../../../../lib/models/Settlement';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, apiResponse, UserError } from '../../../../lib/api';

// Aucune écriture libre ici : le workflow de préparation passe par POST /api/orders/update,
// la Salle par PATCH /api/salle/orders/[id], et la caisse par POST /api/pilotage/actions.

async function findOrder(params: Promise<{ id: string }>, restaurantId: string) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
  await connectMongo();
  const order = (await Order.findOne({ _id: id, restaurantId }).lean()) as Record<string, unknown> | null;
  if (!order) throw new UserError('Not found', 404);
  return { id, order };
}

async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    const { order } = await findOrder(params, session.restaurantId);
    return Response.json(order);
  });
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({
      roles: ['admin'],
      message: 'La suppression d’une commande est réservée à l’administrateur.',
    });
    const { id, order } = await findOrder(params, session.restaurantId);
    if (order.fulfillmentType === 'dine_in') throw new UserError('Utilisez l’annulation dans le module Salle.', 409);
    if (await Settlement.exists({ restaurantId: session.restaurantId, orderId: String(id) }))
      throw new UserError('Une commande avec un historique de pilotage ne peut pas être supprimée.', 409);
    await Order.deleteOne({ _id: id, restaurantId: session.restaurantId });
    return Response.json({ success: true });
  });
}

export const GET = withAudit('GET /api/orders/[id]', handleGET);
export const DELETE = withAudit('DELETE /api/orders/[id]', handleDELETE);

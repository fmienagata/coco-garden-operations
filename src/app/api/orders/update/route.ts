import { withAudit } from '../../../../lib/audit';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../lib/api';
import { dispatchToKitchen } from '../../../../lib/kitchen-dispatch';

const preparationTransitions: Record<string, string> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready' };

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    await connectMongo();
    const body = await readJson(request);
    const { id, patch } = body;
    if (!id || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new UserError('id and patch required');
    const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId });
    if (!order) throw new UserError('Not found', 404);
    if (Object.keys(patch).length !== 1 || typeof patch.status !== 'string') throw new UserError('Seul un changement de statut est autorisé.');
    const allowed = preparationTransitions[order.status];
    if (order.fulfillmentType === 'dine_in') {
      if (!allowed || patch.status !== allowed) throw new UserError('Transition salle invalide. Utilisez le module Salle pour gérer ce ticket.', 409);
    } else {
      if (order.status === 'completed' || order.status === 'cancelled') throw new UserError('Cette commande est clôturée.', 409);
      if (patch.status !== allowed) throw new UserError('Transition de préparation invalide.', 409);
    }
    const changed = await Order.findOneAndUpdate({ _id: order._id, restaurantId: session.restaurantId, status: order.status, __v: order.__v }, { $set: { status: allowed }, $inc: { __v: 1 } }, { new: true });
    if (!changed) throw new UserError('Commande modifiée entre-temps.', 409);
    // Le passage en « confirmée » est le moment où la commande part aux postes de préparation.
    if (allowed === 'confirmed') await dispatchToKitchen(session.restaurantId, String(changed._id));
    return Response.json(changed);
  });
}

export const POST = withAudit("POST /api/orders/update", handlePOST);

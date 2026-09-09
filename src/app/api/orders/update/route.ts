import { withAudit } from '../../../../lib/audit';
import Settlement from '../../../../lib/models/Settlement';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from "../../../../lib/auth";
import { getSession } from "../../../../lib/server-session";

async function handlePOST(request: Request) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const body = await request.json();
  const { id, patch } = body;
  if (!id || !patch || typeof patch !== 'object' || Array.isArray(patch)) return new Response(JSON.stringify({ error: 'id and patch required' }), { status: 400 });
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId });
  if (!order) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  if (Object.keys(patch).length !== 1 || typeof patch.status !== 'string') return Response.json({ error: 'Seul un changement de statut est autorisé.' }, { status: 400 });
  const preparationTransitions: Record<string, string> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready' };
  if (order.fulfillmentType === 'dine_in') {
    const allowed = preparationTransitions[order.status] || null;
    if (Object.keys(patch).length !== 1 || patch.status !== allowed || !allowed) return Response.json({error:'Transition salle invalide. Utilisez le module Salle pour gérer ce ticket.'},{status:409});
    const changed = await Order.findOneAndUpdate({_id:order._id,restaurantId:session.restaurantId,status:order.status,__v:order.__v},{$set:{status:allowed},$inc:{__v:1}},{new:true});
    return changed ? Response.json(changed) : Response.json({error:'Ticket modifié entre-temps.'},{status:409});
  }
  if (order.status === 'completed' || order.status === 'cancelled') return Response.json({ error: 'Cette commande est clôturée.' }, { status: 409 });
  const allowed = preparationTransitions[order.status];
  if (patch.status !== allowed) return Response.json({ error: 'Transition de préparation invalide.' }, { status: 409 });
  const changed = await Order.findOneAndUpdate({ _id: order._id, restaurantId: session.restaurantId, status: order.status, __v: order.__v }, { $set: { status: allowed }, $inc: { __v: 1 } }, { new: true });
  return changed ? Response.json(changed) : Response.json({ error: 'Commande modifiée entre-temps.' }, { status: 409 });
}

export const POST = withAudit("POST /api/orders/update", handlePOST);

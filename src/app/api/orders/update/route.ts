import Settlement from '../../../../lib/models/Settlement';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, getSession } from '../../../../lib/auth';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const body = await request.json();
  const { id, patch } = body;
  if (!id || !patch) return new Response(JSON.stringify({ error: 'id and patch required' }), { status: 400 });
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId });
  if (!order) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  if (patch.status && !['pending', 'confirmed', 'preparing', 'ready', 'driver_assigned', 'in_delivery', 'delivered'].includes(patch.status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }
  const recorded = await Settlement.findOne({ restaurantId: session.restaurantId, orderId: String(id) }).lean() as { collectedAt?: Date } | null;
  if (recorded && (recorded.collectedAt || Object.keys(patch).some(key => key !== 'status'))) return Response.json({ error: 'Les données de cette commande sont protégées par son historique de pilotage.' }, { status: 409 });
  Object.assign(order, patch);
  await order.save();
  return Response.json(order.toObject());
}

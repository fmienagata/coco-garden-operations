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
  const { id } = body;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  if (await Settlement.exists({ restaurantId: session.restaurantId, orderId: String(id) })) return Response.json({ error: 'Une commande avec un historique de pilotage ne peut pas être supprimée.' }, { status: 409 });
  if(await Order.exists({_id:id,restaurantId:session.restaurantId,fulfillmentType:'dine_in'})) return Response.json({error:'Utilisez le module Salle.'},{status:409});
  const deleted = await Order.findOneAndDelete({ _id: id, restaurantId: session.restaurantId });
  if (!deleted) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return Response.json({ success: true });
}

export const POST = withAudit("POST /api/orders/delete", handlePOST);

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
  const { id } = body;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  const deleted = await Order.findOneAndDelete({ _id: id, restaurantId: session.restaurantId });
  if (!deleted) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return Response.json({ success: true });
}

import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, getSession } from '../../../../lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  // Fallback: use string comparison over all documents to avoid ObjectId type issues
  const all = await Order.find({ restaurantId: session.restaurantId }).lean();
  const found = all.find((d: any) => String(d._id) === String(id));
  if (!found) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return Response.json(found);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  const body = await request.json();
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId });
  if (!order) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  Object.assign(order, body);
  await order.save();
  return Response.json(order.toObject());
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  // find by string match then delete by id
  const all = await Order.find({ restaurantId: session.restaurantId }).lean();
  const found = all.find((d: any) => String(d._id) === String(id));
  if (!found) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  await Order.findByIdAndDelete(found._id);
  return Response.json({ success: true });
}

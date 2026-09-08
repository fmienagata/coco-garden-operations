import { cookies } from 'next/headers';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../../../../lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { driverPhone } = await request.json();
  if (typeof driverPhone !== 'string' || driverPhone.replace(/\D/g, '').length < 8) return Response.json({ error: 'Valid driver phone required' }, { status: 400 });
  await connectMongo();
  const { id } = await params;
  const order = await Order.findOneAndUpdate(
    { _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready' },
    { $set: { driverPhone, driverMessageSentAt: new Date() } },
    { new: true },
  ).lean() as { driverPhone?: string; driverMessageSentAt?: Date } | null;
  if (!order) return Response.json({ error: 'Ready delivery order not found' }, { status: 404 });
  return Response.json({ success: true, driverPhone: order.driverPhone, driverMessageSentAt: order.driverMessageSentAt });
}
import { cookies } from 'next/headers';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../../../../lib/auth';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  const order = await Order.findOneAndUpdate(
    { _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready', driverMessageSentAt: { $exists: true } },
    { $set: { customerMessageSentAt: new Date() } },
    { new: true },
  ).lean() as { customerMessageSentAt?: Date } | null;
  if (!order) return Response.json({ error: 'Driver contact is required first' }, { status: 409 });
  return Response.json({ success: true, customerMessageSentAt: order.customerMessageSentAt });
}
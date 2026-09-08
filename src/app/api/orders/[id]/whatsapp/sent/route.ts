import { cookies } from 'next/headers';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../../../../lib/auth';
import { recordSentNotification } from '../../../../../../lib/notifications';

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
  ).lean() as { _id: unknown; orderNumber: string; customerName?: string; customerPhone?: string; deliveryAddress?: string; deliveryNotes?: string; items: { qty: number; name: string }[]; driverPhone?: string; driverMessageSentAt?: Date } | null;
  if (!order) return Response.json({ error: 'Ready delivery order not found' }, { status: 404 });
  const items = order.items.map((item) => `${item.qty}x ${item.name}`).join(', ');
  const message = [`Commande ${order.orderNumber}`, `Client: ${order.customerName || 'Non renseigné'}`, `Téléphone: ${order.customerPhone}`, `Adresse: ${order.deliveryAddress}`, `Détail: ${items}`, order.deliveryNotes ? `Consignes: ${order.deliveryNotes}` : ''].filter(Boolean).join('\n');
  await recordSentNotification({ restaurantId: session.restaurantId, orderId: String(order._id), orderNumber: order.orderNumber, recipientType: 'driver', recipientPhone: driverPhone, message });
  return Response.json({ success: true, driverPhone: order.driverPhone, driverMessageSentAt: order.driverMessageSentAt });
}

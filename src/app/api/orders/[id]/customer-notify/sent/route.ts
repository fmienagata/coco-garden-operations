import { withAudit } from '../../../../../../lib/audit';
import { cookies } from 'next/headers';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../../../lib/auth";
import { getSession } from "../../../../../../lib/server-session";
import { recordSentNotification } from '../../../../../../lib/notifications';

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  const order = await Order.findOneAndUpdate(
    { _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready', driverMessageSentAt: { $exists: true } },
    { $set: { customerMessageSentAt: new Date() } },
    { new: true },
  ).lean() as { _id: unknown; orderNumber: string; customerName?: string; customerPhone?: string; customerMessageSentAt?: Date } | null;
  if (!order) return Response.json({ error: 'Driver contact is required first' }, { status: 409 });
  const message = `Bonjour${order.customerName ? ` ${order.customerName}` : ''}, votre commande ${order.orderNumber} est prête et a été prise en charge par notre livreur. Merci de rester disponible pour la réception.`;
  await recordSentNotification({ restaurantId: session.restaurantId, orderId: String(order._id), orderNumber: order.orderNumber, recipientType: 'customer', recipientPhone: order.customerPhone || '', message });
  return Response.json({ success: true, customerMessageSentAt: order.customerMessageSentAt });
}

export const POST = withAudit("POST /api/orders/[id]/customer-notify/sent", handlePOST);

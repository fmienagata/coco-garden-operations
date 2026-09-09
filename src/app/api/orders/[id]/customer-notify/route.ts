import { withAudit } from '../../../../../lib/audit';
import { cookies } from 'next/headers';
import Order from '../../../../../lib/models/Order';
import { connectMongo } from '../../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../../lib/auth";
import { getSession } from "../../../../../lib/server-session";

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready', driverMessageSentAt: { $exists: true }, customerPhone: { $exists: true } }).lean() as {
    orderNumber: string;
    customerName?: string;
    customerPhone: string;
    customerMessageSentAt?: Date;
  } | null;
  if (!order) return Response.json({ error: 'Driver must be contacted before notifying the customer' }, { status: 409 });

  const message = `Bonjour${order.customerName ? ` ${order.customerName}` : ''}, votre commande ${order.orderNumber} est prête et a été prise en charge par notre livreur. Merci de rester disponible pour la réception.`;
  return Response.json({ customerPhone: digitsOnly(order.customerPhone), message, customerWhatsappUrl: `https://wa.me/${digitsOnly(order.customerPhone)}?text=${encodeURIComponent(message)}`, customerMessageSentAt: order.customerMessageSentAt || null });
}

export const POST = withAudit("POST /api/orders/[id]/customer-notify", handlePOST);

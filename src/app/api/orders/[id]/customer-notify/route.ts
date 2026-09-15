import { withAudit } from '../../../../../lib/audit';
import Order from '../../../../../lib/models/Order';
import { connectMongo } from '../../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../../lib/api';
import mongoose from 'mongoose';

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
  const session = await requireSession({ module: 'cuisine' });
  await connectMongo();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready', driverMessageSentAt: { $exists: true }, customerPhone: { $exists: true } }).lean() as {
    orderNumber: string;
    customerName?: string;
    customerPhone: string;
    customerMessageSentAt?: Date;
  } | null;
  if (!order) throw new UserError('Driver must be contacted before notifying the customer', 409);

  const message = `Bonjour${order.customerName ? ` ${order.customerName}` : ''}, votre commande ${order.orderNumber} est prête et a été prise en charge par notre livreur. Merci de rester disponible pour la réception.`;
  return Response.json({ customerPhone: digitsOnly(order.customerPhone), message, customerWhatsappUrl: `https://wa.me/${digitsOnly(order.customerPhone)}?text=${encodeURIComponent(message)}`, customerMessageSentAt: order.customerMessageSentAt || null });
  });
}

export const POST = withAudit("POST /api/orders/[id]/customer-notify", handlePOST);

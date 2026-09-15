import { withAudit } from '../../../../../../lib/audit';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../../../lib/api';
import mongoose from 'mongoose';
import { recordSentNotification } from '../../../../../../lib/notifications';

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    await connectMongo();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const order = (await Order.findOneAndUpdate(
      {
        _id: id,
        restaurantId: session.restaurantId,
        fulfillmentType: 'delivery',
        status: 'ready',
        driverMessageSentAt: { $exists: true },
      },
      { $set: { customerMessageSentAt: new Date() } },
      { new: true },
    ).lean()) as {
      _id: unknown;
      orderNumber: string;
      customerName?: string;
      customerPhone?: string;
      customerMessageSentAt?: Date;
    } | null;
    if (!order) throw new UserError('Driver contact is required first', 409);
    const message = `Bonjour${order.customerName ? ` ${order.customerName}` : ''}, votre commande ${order.orderNumber} est prête et a été prise en charge par notre livreur. Merci de rester disponible pour la réception.`;
    await recordSentNotification({
      restaurantId: session.restaurantId,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      recipientType: 'customer',
      recipientPhone: order.customerPhone || '',
      message,
    });
    return Response.json({ success: true, customerMessageSentAt: order.customerMessageSentAt });
  });
}

export const POST = withAudit('POST /api/orders/[id]/customer-notify/sent', handlePOST);

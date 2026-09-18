import { withAudit } from '../../../../../../lib/audit';
import Order from '../../../../../../lib/models/Order';
import { connectMongo } from '../../../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../../../lib/api';
import mongoose from 'mongoose';
import { recordSentNotification } from '../../../../../../lib/notifications';

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    const { driverPhone } = await readJson(request);
    if (typeof driverPhone !== 'string' || driverPhone.replace(/\D/g, '').length < 8)
      throw new UserError('Valid driver phone required', 400);
    await connectMongo();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const order = (await Order.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready' },
      { $set: { driverPhone, driverMessageSentAt: new Date() } },
      { new: true },
    ).lean()) as {
      _id: unknown;
      orderNumber: string;
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
      deliveryNotes?: string;
      items: { qty: number; name: string }[];
      driverPhone?: string;
      driverMessageSentAt?: Date;
    } | null;
    if (!order) throw new UserError('Ready delivery order not found', 404);
    const items = order.items.map((item) => `${item.qty}x ${item.name}`).join(', ');
    const message = [
      `Commande ${order.orderNumber}`,
      `Client: ${order.customerName || 'Non renseigné'}`,
      `Téléphone: ${order.customerPhone}`,
      `Adresse: ${order.deliveryAddress}`,
      `Détail: ${items}`,
      order.deliveryNotes ? `Consignes: ${order.deliveryNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await recordSentNotification({
      restaurantId: session.restaurantId,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      recipientType: 'driver',
      recipientPhone: driverPhone,
      message,
    });
    return Response.json({
      success: true,
      driverPhone: order.driverPhone,
      driverMessageSentAt: order.driverMessageSentAt,
    });
  });
}

export const POST = withAudit('POST /api/orders/[id]/whatsapp/sent', handlePOST);

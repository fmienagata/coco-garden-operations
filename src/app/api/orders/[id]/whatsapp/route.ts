import { withAudit } from '../../../../../lib/audit';
import Order from '../../../../../lib/models/Order';
import { connectMongo } from '../../../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../../../lib/api';
import mongoose from 'mongoose';

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });

    const { driverPhone } = await readJson(request);
    const normalizedDriverPhone = typeof driverPhone === 'string' ? digitsOnly(driverPhone) : '';
    if (normalizedDriverPhone.length < 8) throw new UserError('Valid driver phone required', 400);

    await connectMongo();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const order = (await Order.findOne({
      _id: id,
      restaurantId: session.restaurantId,
      fulfillmentType: 'delivery',
      status: 'ready',
    }).lean()) as {
      orderNumber: string;
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
      deliveryZoneName?: string;
      deliveryFee?: number;
      deliveryNotes?: string;
      items: { qty: number; name: string }[];
    } | null;
    if (!order) throw new UserError('Delivery order must be ready before contacting the driver', 409);

    const items = order.items.map((item: { qty: number; name: string }) => `${item.qty}x ${item.name}`).join(', ');
    const message = [
      `Commande ${order.orderNumber}`,
      `Client: ${order.customerName || 'Non renseigné'}`,
      `Téléphone: ${order.customerPhone}`,
      `Adresse: ${order.deliveryAddress}`,
      `Zone: ${order.deliveryZoneName || 'Non renseignée'} · Frais: ${order.deliveryFee || 0} FCFA`,
      `Détail: ${items}`,
      order.deliveryNotes ? `Consignes: ${order.deliveryNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return Response.json({
      driverPhone: normalizedDriverPhone,
      message,
      whatsappUrl: `https://wa.me/${normalizedDriverPhone}?text=${encodeURIComponent(message)}`,
    });
  });
}

export const POST = withAudit('POST /api/orders/[id]/whatsapp', handlePOST);

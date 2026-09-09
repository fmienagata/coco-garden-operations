import { withAudit } from '../../../../../lib/audit';
import { cookies } from 'next/headers';
import Order from '../../../../../lib/models/Order';
import { connectMongo } from '../../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../../lib/auth";
import { getSession } from "../../../../../lib/server-session";

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { driverPhone } = await request.json();
  const normalizedDriverPhone = typeof driverPhone === 'string' ? digitsOnly(driverPhone) : '';
  if (normalizedDriverPhone.length < 8) return Response.json({ error: 'Valid driver phone required' }, { status: 400 });

  await connectMongo();
  const { id } = await params;
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery', status: 'ready' }).lean() as {
    orderNumber: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryZoneName?: string;
    deliveryFee?: number;
    deliveryNotes?: string;
    items: { qty: number; name: string }[];
  } | null;
  if (!order) return Response.json({ error: 'Delivery order must be ready before contacting the driver' }, { status: 409 });

  const items = order.items.map((item: { qty: number; name: string }) => `${item.qty}x ${item.name}`).join(', ');
  const message = [
    `Commande ${order.orderNumber}`,
    `Client: ${order.customerName || 'Non renseigné'}`,
    `Téléphone: ${order.customerPhone}`,
    `Adresse: ${order.deliveryAddress}`,
    `Zone: ${order.deliveryZoneName || 'Non renseignée'} · Frais: ${order.deliveryFee || 0} FCFA`,
    `Détail: ${items}`,
    order.deliveryNotes ? `Consignes: ${order.deliveryNotes}` : '',
  ].filter(Boolean).join('\n');
  return Response.json({ driverPhone: normalizedDriverPhone, message, whatsappUrl: `https://wa.me/${normalizedDriverPhone}?text=${encodeURIComponent(message)}` });
}

export const POST = withAudit("POST /api/orders/[id]/whatsapp", handlePOST);

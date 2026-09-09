import { withAudit } from '../../../lib/audit';
import Settlement from '../../../lib/models/Settlement';
import Order from '../../../lib/models/Order';
import { connectMongo } from '../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from "../../../lib/auth";
import { getSession, isWhatsappAgentRequest } from "../../../lib/server-session";
import { getNextOrderNumber } from '../../../lib/orders';
import MenuItem from '../../../lib/models/MenuItem';
import DeliveryZone from '../../../lib/models/DeliveryZone';
import { DEFAULT_RESTAURANT_ID } from '../../../lib/auth';

async function handleGET() {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const restaurantId = session.restaurantId;
  await connectMongo();
  const orders = await Order.find({ restaurantId, status:{$ne:'draft'} }).sort({ createdAt: -1 }).limit(100).lean();
  const collected = await Settlement.find({ restaurantId, collectedAt: { $exists: true } }).select('orderId').lean() as { orderId: string }[];
  const collectedIds = new Set(collected.map(item => item.orderId));
    return Response.json(orders.map(order => collectedIds.has(String(order._id)) && !['cancelled', 'completed'].includes(order.status) ? { ...order, status: 'collected' } : order));
}

async function handlePOST(request: Request) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  const isWhatsappAgent = await isWhatsappAgentRequest(request);
  if (!session && !isWhatsappAgent) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session && !session.actorType && !isWhatsappAgent) return Response.json({ error: 'Actor non identifié' }, { status: 403 });
  const restaurantId = session?.restaurantId || DEFAULT_RESTAURANT_ID;
  await connectMongo();
  const body = await request.json();
  const { tableNumber, items, fulfillmentType = 'takeaway', customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone, deliveryZoneId } = body;
  const hasDeliveryDetails = typeof customerPhone === 'string' && customerPhone.trim().length >= 8 && typeof deliveryAddress === 'string' && deliveryAddress.trim().length >= 5;
  if ((fulfillmentType === 'delivery' && (!hasDeliveryDetails || typeof deliveryZoneId !== 'string' || !deliveryZoneId.trim())) || !Array.isArray(items) || items.length === 0 || !['delivery', 'takeaway'].includes(fulfillmentType)) {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
  }

  const menuItems = await MenuItem.find({ restaurantId, active: true }).lean();
  const normalizedItems = items.map((item: any) => {
    const menuItem = menuItems.find((candidate: any) => (item.itemCode && candidate.itemCode === item.itemCode) || (!item.itemCode && candidate.name === item.name));
    if (!menuItem || !Number.isInteger(item.qty) || item.qty <= 0) return null;
    return { name: menuItem.name, itemCode: menuItem.itemCode, qty: item.qty, price: menuItem.price };
  });
  if (normalizedItems.some((item) => !item)) return Response.json({ error: 'Each item must match an available menu item and have a positive quantity' }, { status: 400 });
  const validItems = normalizedItems as { name: string; itemCode: string; qty: number; price: number }[];
  const zone = fulfillmentType === 'delivery'
    ? await DeliveryZone.findOne({ restaurantId, _id: deliveryZoneId, active: true }).lean() as { _id: unknown; name: string; fee: number } | null
    : null;
  if (fulfillmentType === 'delivery' && !zone) return Response.json({ error: 'Choisissez une zone de livraison active' }, { status: 400 });
  const deliveryFee = zone?.fee || 0;
  const total = validItems.reduce((sum, item) => sum + item.price * item.qty, 0) + deliveryFee;
  const orderNumber = await getNextOrderNumber(restaurantId);
  const createdByType = isWhatsappAgent ? 'whatsapp_agent' : 'management';
  const createdBy = isWhatsappAgent ? 'whatsapp-agent' : session!.login;
  const createdByLabel = isWhatsappAgent ? 'Agent WhatsApp' : `Management · ${session!.login}`;
  const doc = await Order.create({ restaurantId, orderNumber, createdBy, createdByType, createdByLabel, fulfillmentType, items: validItems, total, deliveryFee, deliveryZoneId: zone ? String(zone._id) : undefined, deliveryZoneName: zone?.name, customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone });
  return new Response(JSON.stringify(doc), { status: 201 });
}

export const GET = withAudit("GET /api/orders", handleGET);
export const POST = withAudit("POST /api/orders", handlePOST);

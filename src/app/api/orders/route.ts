import { withAudit } from '../../../lib/audit';
import { cookies } from 'next/headers';
import Settlement from '../../../lib/models/Settlement';
import Order from '../../../lib/models/Order';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE, DEFAULT_RESTAURANT_ID } from '../../../lib/auth';
import { getSession, isWhatsappAgentRequest } from '../../../lib/server-session';
import { requireSession, readJson, apiResponse, UserError, type ApiSession } from '../../../lib/api';
import { getNextOrderNumber } from '../../../lib/orders';
import MenuItem from '../../../lib/models/MenuItem';
import DeliveryZone from '../../../lib/models/DeliveryZone';

async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    const restaurantId = session.restaurantId;
    await connectMongo();
    const orders = await Order.find({ restaurantId, status: { $ne: 'draft' } }).sort({ createdAt: -1 }).limit(100).lean();
    const collected = await Settlement.find({ restaurantId, collectedAt: { $exists: true } }).select('orderId').lean() as { orderId: string }[];
    const collectedIds = new Set(collected.map(item => item.orderId));
    return Response.json(orders.map(order => collectedIds.has(String(order._id)) && !['cancelled', 'completed'].includes(order.status) ? { ...order, status: 'collected' } : order));
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    // L'Agent WhatsApp s'authentifie par en-tête et non par session ; une prise de commande
    // par l'équipe reste réservée aux rôles qui encaissent, pas à la cuisine.
    const isWhatsappAgent = await isWhatsappAgentRequest(request);
    const session: ApiSession | null = isWhatsappAgent
      ? await getSession((await cookies()).get(AUTH_COOKIE)?.value) as ApiSession | null
      : await requireSession({ roles: ['admin', 'serveur'], message: 'La prise de commande est réservée aux serveurs et administrateurs.' });
    const restaurantId = session?.restaurantId || DEFAULT_RESTAURANT_ID;
    await connectMongo();
    const body = await readJson(request);
    const { items, fulfillmentType = 'takeaway', customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone, deliveryZoneId } = body;
    const hasDeliveryDetails = typeof customerPhone === 'string' && customerPhone.trim().length >= 8 && typeof deliveryAddress === 'string' && deliveryAddress.trim().length >= 5;
    if ((fulfillmentType === 'delivery' && (!hasDeliveryDetails || typeof deliveryZoneId !== 'string' || !deliveryZoneId.trim())) || !Array.isArray(items) || items.length === 0 || !['delivery', 'takeaway'].includes(fulfillmentType)) {
      throw new UserError('Invalid payload');
    }

    const menuItems = await MenuItem.find({ restaurantId, active: true }).lean();
    const normalizedItems = items.map((item: any) => {
      const menuItem = menuItems.find((candidate: any) => (item.itemCode && candidate.itemCode === item.itemCode) || (!item.itemCode && candidate.name === item.name));
      if (!menuItem || !Number.isInteger(item.qty) || item.qty <= 0) return null;
      return { name: menuItem.name, itemCode: menuItem.itemCode, qty: item.qty, price: menuItem.price };
    });
    if (normalizedItems.some((item) => !item)) throw new UserError('Each item must match an available menu item and have a positive quantity');
    const validItems = normalizedItems as { name: string; itemCode: string; qty: number; price: number }[];
    const zone = fulfillmentType === 'delivery'
      ? await DeliveryZone.findOne({ restaurantId, _id: deliveryZoneId, active: true }).lean() as { _id: unknown; name: string; fee: number } | null
      : null;
    if (fulfillmentType === 'delivery' && !zone) throw new UserError('Choisissez une zone de livraison active');
    const deliveryFee = zone?.fee || 0;
    const total = validItems.reduce((sum, item) => sum + item.price * item.qty, 0) + deliveryFee;
    const orderNumber = await getNextOrderNumber(restaurantId);
    const createdByType = isWhatsappAgent ? 'whatsapp_agent' : 'management';
    const createdBy = isWhatsappAgent ? 'whatsapp-agent' : session!.login;
    const createdByLabel = isWhatsappAgent ? 'Agent WhatsApp' : `Management · ${session!.login}`;
    const doc = await Order.create({ restaurantId, orderNumber, createdBy, createdByType, createdByLabel, fulfillmentType, items: validItems, total, deliveryFee, deliveryZoneId: zone ? String(zone._id) : undefined, deliveryZoneName: zone?.name, customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone });
    return Response.json(doc, { status: 201 });
  });
}

export const GET = withAudit("GET /api/orders", handleGET);
export const POST = withAudit("POST /api/orders", handlePOST);

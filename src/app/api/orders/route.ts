import Order from '../../../lib/models/Order';
import { connectMongo } from '../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, getSession } from '../../../lib/auth';
import { getNextOrderNumber } from '../../../lib/orders';
import MenuItem from '../../../lib/models/MenuItem';

export async function GET() {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const orders = await Order.find({ restaurantId: session.restaurantId }).sort({ createdAt: -1 }).limit(100).lean();
  return Response.json(orders);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const body = await request.json();
  const { tableNumber, items, fulfillmentType = 'takeaway', customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone } = body;
  const hasValidTable = Number.isInteger(tableNumber) && tableNumber > 0;
  const hasDeliveryDetails = typeof customerPhone === 'string' && customerPhone.trim().length >= 8 && typeof deliveryAddress === 'string' && deliveryAddress.trim().length >= 5;
  if ((!hasValidTable && fulfillmentType === 'takeaway') || (hasValidTable && fulfillmentType === 'delivery') || (fulfillmentType === 'delivery' && !hasDeliveryDetails) || !Array.isArray(items) || items.length === 0 || !['delivery', 'takeaway'].includes(fulfillmentType)) {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
  }

  const menuItems = await MenuItem.find({ restaurantId: session.restaurantId, active: true }).lean();
  const normalizedItems = items.map((item: any) => {
    const menuItem = menuItems.find((candidate: any) => (item.itemCode && candidate.itemCode === item.itemCode) || (!item.itemCode && candidate.name === item.name));
    if (!menuItem || !Number.isInteger(item.qty) || item.qty <= 0) return null;
    return { name: menuItem.name, itemCode: menuItem.itemCode, qty: item.qty, price: menuItem.price };
  });
  if (normalizedItems.some((item) => !item)) return Response.json({ error: 'Each item must match an available menu item and have a positive quantity' }, { status: 400 });
  const validItems = normalizedItems as { name: string; itemCode: string; qty: number; price: number }[];
  const total = validItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const orderNumber = await getNextOrderNumber(session.restaurantId);
  const doc = await Order.create({ restaurantId: session.restaurantId, orderNumber, fulfillmentType, tableNumber, items: validItems, total, customerName, customerPhone, deliveryAddress, deliveryNotes, driverPhone });
  return new Response(JSON.stringify(doc), { status: 201 });
}

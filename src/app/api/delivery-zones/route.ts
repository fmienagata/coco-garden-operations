import { cookies } from 'next/headers';
import DeliveryZone from '../../../lib/models/DeliveryZone';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../lib/auth';

async function getRestaurantId() { return getSession((await cookies()).get(AUTH_COOKIE)?.value)?.restaurantId; }

export async function GET() {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  return Response.json(await DeliveryZone.find({ restaurantId }).sort({ active: -1, sortOrder: 1, name: 1 }).lean());
}

export async function POST(request: Request) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, fee } = await request.json();
  if (typeof name !== 'string' || !name.trim() || !Number.isInteger(fee) || fee < 0) return Response.json({ error: 'Zone et tarif entier en FCFA requis' }, { status: 400 });
  await connectMongo();
  return Response.json(await DeliveryZone.create({ restaurantId, name: name.trim(), fee }), { status: 201 });
}
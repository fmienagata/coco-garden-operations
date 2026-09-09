import { withAudit } from '../../../lib/audit';
import { cookies } from 'next/headers';
import DeliveryZone from '../../../lib/models/DeliveryZone';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../lib/auth";
import { getSession } from "../../../lib/server-session";

async function getRestaurantId() { return (await getSession((await cookies()).get(AUTH_COOKIE)?.value))?.restaurantId; }

async function handleGET() {
  const session = (await getSession((await cookies()).get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const restaurantId = session.restaurantId;
  await connectMongo();
  return Response.json(await DeliveryZone.find({ restaurantId }).sort({ active: -1, sortOrder: 1, name: 1 }).lean());
}

async function handlePOST(request: Request) {
  const session = (await getSession((await cookies()).get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return Response.json({ error: 'Accès réservé à l’administrateur' }, { status: 403 });
  const restaurantId = session.restaurantId;
  const { name, fee } = await request.json();
  if (typeof name !== 'string' || !name.trim() || !Number.isInteger(fee) || fee < 0) return Response.json({ error: 'Zone et tarif entier en FCFA requis' }, { status: 400 });
  await connectMongo();
  return Response.json(await DeliveryZone.create({ restaurantId, name: name.trim(), fee }), { status: 201 });
}
export const GET = withAudit("GET /api/delivery-zones", handleGET);
export const POST = withAudit("POST /api/delivery-zones", handlePOST);

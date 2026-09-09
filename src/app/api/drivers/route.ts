import { withAudit } from '../../../lib/audit';
import { cookies } from 'next/headers';
import Driver from '../../../lib/models/Driver';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../lib/auth";
import { getSession } from "../../../lib/server-session";

async function restaurantId() {
  const cookieStore = await cookies();
  return (await getSession(cookieStore.get(AUTH_COOKIE)?.value))?.restaurantId;
}

async function handleGET() {
  const id = await restaurantId();
  if (!id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  return Response.json(await Driver.find({ restaurantId: id }).sort({ available: -1, active: -1, name: 1 }).lean());
}

async function handlePOST(request: Request) {
  const id = await restaurantId();
  if (!id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, phone } = await request.json();
  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 8) return Response.json({ error: 'Name and valid phone are required' }, { status: 400 });
  await connectMongo();
  return Response.json(await Driver.create({ restaurantId: id, name: name.trim(), phone: phone.trim(), available: true }), { status: 201 });
}

export const GET = withAudit("GET /api/drivers", handleGET);
export const POST = withAudit("POST /api/drivers", handlePOST);

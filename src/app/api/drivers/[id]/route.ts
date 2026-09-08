import { cookies } from 'next/headers';
import Driver from '../../../../lib/models/Driver';
import { connectMongo } from '../../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../../lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = getSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { available } = await request.json();
  if (typeof available !== 'boolean') return Response.json({ error: 'Available must be a boolean' }, { status: 400 });
  await connectMongo();
  const { id } = await params;
  const driver = await Driver.findOneAndUpdate({ _id: id, restaurantId: session.restaurantId }, { $set: { available } }, { new: true }).lean();
  if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });
  return Response.json(driver);
}
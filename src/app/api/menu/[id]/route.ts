import { cookies } from 'next/headers';
import MenuItem from '../../../../lib/models/MenuItem';
import { connectMongo } from '../../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../../lib/auth';

async function getRestaurant() {
  const cookieStore = await cookies();
  return getSession(cookieStore.get(AUTH_COOKIE)?.value)?.restaurantId;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurant();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const patch = await request.json();
  if (patch.active !== undefined && typeof patch.active !== 'boolean') return Response.json({ error: 'Availability must be a boolean' }, { status: 400 });
  if (patch.price !== undefined && (!Number.isInteger(patch.price) || patch.price < 0)) return Response.json({ error: 'Price must be a whole CFA amount' }, { status: 400 });
  if (patch.variants !== undefined && (!Array.isArray(patch.variants) || !patch.variants.every((variant: any) => typeof variant.label === 'string' && variant.label.trim() && Number.isInteger(variant.price) && variant.price >= 0))) return Response.json({ error: 'Invalid price variants' }, { status: 400 });
  await connectMongo();
  const item = await MenuItem.findOneAndUpdate({ _id: id, restaurantId }, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(item);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurant();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await connectMongo();
  const item = await MenuItem.findOneAndDelete({ _id: id, restaurantId });
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ success: true });
}

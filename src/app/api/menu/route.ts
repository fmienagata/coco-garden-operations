import { cookies } from 'next/headers';
import MenuItem from '../../../lib/models/MenuItem';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE, getSession } from '../../../lib/auth';
import { getNextMenuCode } from '../../../lib/menu';

async function getRestaurant() {
  const cookieStore = await cookies();
  return getSession(cookieStore.get(AUTH_COOKIE)?.value)?.restaurantId;
}

export async function GET() {
  const restaurantId = await getRestaurant();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const items = await MenuItem.find({ restaurantId }).sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  return Response.json(items);
}

export async function POST(request: Request) {
  const restaurantId = await getRestaurant();
  if (!restaurantId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { category, name, description = '', price, variants = [], imageUrl = '' } = body;
  const validVariants = Array.isArray(variants) && variants.every((variant: any) => typeof variant.label === 'string' && variant.label.trim() && Number.isInteger(variant.price) && variant.price >= 0);
  if (typeof category !== 'string' || !category.trim() || typeof name !== 'string' || !name.trim() || !Number.isInteger(price) || price < 0 || !validVariants) {
    return Response.json({ error: 'Category, name and whole CFA price are required' }, { status: 400 });
  }
  await connectMongo();
  const itemCode = await getNextMenuCode(restaurantId);
  const item = await MenuItem.create({ restaurantId, itemCode, category: category.trim(), name: name.trim(), description, price, variants, imageUrl });
  return Response.json(item.toObject(), { status: 201 });
}
import { withAudit } from '../../../lib/audit';
import MenuItem from '../../../lib/models/MenuItem';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../lib/api';
import { getNextMenuCode } from '../../../lib/menu';

async function handleGET() {
  return apiResponse(async () => {
    // Donnée de référence en lecture : la cuisine et la prise de commande en dépendent.
    const session = await requireSession();
    await connectMongo();
    return Response.json(await MenuItem.find({ restaurantId: session.restaurantId }).sort({ category: 1, sortOrder: 1, name: 1 }).lean());
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur' });
    const body = await readJson(request);
    const { category, name, description = '', price, variants = [], imageUrl = '' } = body;
    const validVariants = Array.isArray(variants) && variants.every((variant: any) => typeof variant.label === 'string' && variant.label.trim() && Number.isInteger(variant.price) && variant.price >= 0);
    if (typeof category !== 'string' || !category.trim() || typeof name !== 'string' || !name.trim() || !Number.isInteger(price) || price < 0 || !validVariants) {
      throw new UserError('Category, name and whole CFA price are required');
    }
    await connectMongo();
    const itemCode = await getNextMenuCode(session.restaurantId);
    const item = await MenuItem.create({ restaurantId: session.restaurantId, itemCode, category: category.trim(), name: name.trim(), description, price, variants, imageUrl });
    return Response.json(item.toObject(), { status: 201 });
  });
}

export const GET = withAudit("GET /api/menu", handleGET);
export const POST = withAudit("POST /api/menu", handlePOST);

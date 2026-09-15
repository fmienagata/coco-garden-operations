import { withAudit } from '../../../lib/audit';
import DeliveryZone from '../../../lib/models/DeliveryZone';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../lib/api';

async function handleGET() {
  return apiResponse(async () => {
    // Donnée de référence en lecture : nécessaire à toute prise de commande, sans caractère sensible.
    const session = await requireSession();
    await connectMongo();
    return Response.json(await DeliveryZone.find({ restaurantId: session.restaurantId }).sort({ active: -1, sortOrder: 1, name: 1 }).lean());
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const session = await requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur' });
    const { name, fee } = await readJson(request);
    if (typeof name !== 'string' || !name.trim() || !Number.isInteger(fee) || fee < 0) throw new UserError('Zone et tarif entier en FCFA requis');
    await connectMongo();
    return Response.json(await DeliveryZone.create({ restaurantId: session.restaurantId, name: name.trim(), fee }), { status: 201 });
  });
}

export const GET = withAudit("GET /api/delivery-zones", handleGET);
export const POST = withAudit("POST /api/delivery-zones", handlePOST);

import { withAudit } from '../../../lib/audit';
import Driver from '../../../lib/models/Driver';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse, UserError } from '../../../lib/api';

async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'livraison' });
    await connectMongo();
    return Response.json(await Driver.find({ restaurantId: session.restaurantId }).sort({ available: -1, active: -1, name: 1 }).lean());
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    // Enregistrer un livreur est une configuration, au même titre que la carte ou les tables.
    const session = await requireSession({ roles: ['admin'], message: 'Configuration réservée aux administrateurs.' });
    const { name, phone } = await readJson(request);
    if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 8) throw new UserError('Name and valid phone are required');
    await connectMongo();
    return Response.json(await Driver.create({ restaurantId: session.restaurantId, name: name.trim(), phone: phone.trim(), available: true }), { status: 201 });
  });
}

export const GET = withAudit("GET /api/drivers", handleGET);
export const POST = withAudit("POST /api/drivers", handlePOST);

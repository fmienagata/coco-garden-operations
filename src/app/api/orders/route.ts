import { withAudit } from '../../../lib/audit';
import { cookies } from 'next/headers';
import Settlement from '../../../lib/models/Settlement';
import Order from '../../../lib/models/Order';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE, DEFAULT_RESTAURANT_ID } from '../../../lib/auth';
import { getSession, isWhatsappAgentRequest } from '../../../lib/server-session';
import { requireSession, readJson, apiResponse, type ApiSession } from '../../../lib/api';
import { createIntakeOrder } from '../../../lib/order-intake';

async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    const restaurantId = session.restaurantId;
    await connectMongo();
    const orders = await Order.find({ restaurantId, status: { $ne: 'draft' } })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const collected = (await Settlement.find({ restaurantId, collectedAt: { $exists: true } })
      .select('orderId')
      .lean()) as { orderId: string }[];
    const collectedIds = new Set(collected.map((item) => item.orderId));
    return Response.json(
      orders.map((order) =>
        collectedIds.has(String(order._id)) && !['cancelled', 'completed'].includes(order.status)
          ? { ...order, status: 'collected' }
          : order,
      ),
    );
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    // L'Agent WhatsApp s'authentifie par en-tête et non par session ; une prise de commande
    // par l'équipe reste réservée aux rôles qui encaissent, pas à la cuisine.
    const isWhatsappAgent = await isWhatsappAgentRequest(request);
    const session: ApiSession | null = isWhatsappAgent
      ? ((await getSession((await cookies()).get(AUTH_COOKIE)?.value)) as ApiSession | null)
      : await requireSession({
          roles: ['admin', 'serveur'],
          message: 'La prise de commande est réservée aux serveurs et administrateurs.',
        });
    const restaurantId = session?.restaurantId || DEFAULT_RESTAURANT_ID;
    const body = await readJson(request);
    const { order } = await createIntakeOrder(
      {
        restaurantId,
        createdBy: isWhatsappAgent ? 'whatsapp-agent' : session!.login,
        createdByType: isWhatsappAgent ? 'whatsapp_agent' : 'management',
        createdByLabel: isWhatsappAgent ? 'Agent WhatsApp' : `Management · ${session!.login}`,
      },
      body,
    );
    return Response.json(order, { status: 201 });
  });
}

export const GET = withAudit('GET /api/orders', handleGET);
export const POST = withAudit('POST /api/orders', handlePOST);

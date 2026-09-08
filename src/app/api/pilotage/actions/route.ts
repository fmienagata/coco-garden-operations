import { cookies } from 'next/headers';
import mongoose from 'mongoose';
import { AUTH_COOKIE, getSession } from '../../../../lib/auth';
import { connectMongo } from '../../../../lib/db/mongo';
import Order from '../../../../lib/models/Order';
import Settlement from '../../../../lib/models/Settlement';
export async function POST(request: Request) {
  const session = getSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origine non autorisée.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !mongoose.isValidObjectId(body.orderId) || !['pay', 'refund', 'collect'].includes(body.action)) return Response.json({ error: 'Action invalide.' }, { status: 400 });
  if (body.confirmed !== true) return Response.json({ error: 'Une confirmation explicite est nécessaire.' }, { status: 400 });
  if (body.action === 'pay' && !['cash', 'mobile_money', 'card', 'transfer'].includes(body.method)) return Response.json({ error: 'Choisissez un moyen de paiement.' }, { status: 400 });
  if (body.action === 'refund' && (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500)) return Response.json({ error: 'Indiquez un motif de remboursement (3 à 500 caractères).' }, { status: 400 });
  try {
    await connectMongo();
    const order = await Order.findOne({ _id: body.orderId, restaurantId: session.restaurantId }).lean() as { status: string; total: number; fulfillmentType: string } | null;
    if (!order) return Response.json({ error: 'Commande introuvable.' }, { status: 404 });
    const identity = { _id: `${session.restaurantId}:${body.orderId}`, restaurantId: session.restaurantId, orderId: body.orderId };
    if (body.action === 'pay' && (order.status === 'cancelled' || !Number.isSafeInteger(order.total) || order.total <= 0)) return Response.json({ error: 'Cette commande ne peut pas être encaissée.' }, { status: 409 });
    if (body.action === 'collect' && (order.fulfillmentType !== 'takeaway' || order.status !== 'ready')) return Response.json({ error: 'Seule une commande à emporter prête peut être remise.' }, { status: 409 });
    // Insert the identity once; no overwrite on a repeated request.
    try { if (body.action !== 'refund') await Settlement.updateOne(identity, { $setOnInsert: identity }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const now = new Date();
    const changes = body.action === 'pay' ? { amount: order.total, method: body.method, paidAt: now, paidBy: session.login }
      : body.action === 'refund' ? { refundedAt: now, refundedBy: session.login, refundReason: body.reason.trim() }
      : { collectedAt: now, collectedBy: session.login };
    const guard = body.action === 'pay' ? { paidAt: { $exists: false } }
      : body.action === 'refund' ? { paidAt: { $exists: true }, refundedAt: { $exists: false } }
      : { collectedAt: { $exists: false } };
    const result = await Settlement.findOneAndUpdate({ ...identity, ...guard }, { $set: changes }, { new: true }).lean();
    if (!result) return Response.json({ error: 'Action déjà enregistrée ou encaissement absent. Actualisez le tableau.' }, { status: 409 });
    return Response.json({ success: true });
  } catch { return Response.json({ error: 'Enregistrement impossible. Actualisez avant de réessayer.' }, { status: 503 }); }
}

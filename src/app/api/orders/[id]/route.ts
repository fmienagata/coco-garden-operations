import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import Settlement from '../../../../lib/models/Settlement';
import Order from '../../../../lib/models/Order';
import { connectMongo } from '../../../../lib/db/mongo';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from "../../../../lib/auth";
import { getSession } from "../../../../lib/server-session";

// Aucune écriture libre ici : le workflow de préparation passe par POST /api/orders/update,
// la Salle par PATCH /api/salle/orders/[id], et la caisse par POST /api/pilotage/actions.

async function resolve(params: Promise<{ id: string }>, restaurantId: string) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return { id, order: null as Record<string, unknown> | null, invalid: true };
  await connectMongo();
  const order = await Order.findOne({ _id: id, restaurantId }).lean() as Record<string, unknown> | null;
  return { id, order, invalid: false };
}

async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { order, invalid } = await resolve(params, session.restaurantId);
  if (invalid) return Response.json({ error: 'Identifiant invalide.' }, { status: 400 });
  if (!order) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(order);
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, order, invalid } = await resolve(params, session.restaurantId);
  if (invalid) return Response.json({ error: 'Identifiant invalide.' }, { status: 400 });
  if (!order) return Response.json({ error: 'Not found' }, { status: 404 });
  if (order.fulfillmentType === 'dine_in') return Response.json({ error: 'Utilisez l’annulation dans le module Salle.' }, { status: 409 });
  if (await Settlement.exists({ restaurantId: session.restaurantId, orderId: String(id) })) return Response.json({ error: 'Une commande avec un historique de pilotage ne peut pas être supprimée.' }, { status: 409 });
  await Order.deleteOne({ _id: id, restaurantId: session.restaurantId });
  return Response.json({ success: true });
}

export const GET = withAudit("GET /api/orders/[id]", handleGET);
export const DELETE = withAudit("DELETE /api/orders/[id]", handleDELETE);

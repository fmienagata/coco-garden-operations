import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import DeliveryZone from '../../../../lib/models/DeliveryZone';
import { connectMongo } from '../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../lib/auth";
import { getSession } from "../../../../lib/server-session";

async function handlePUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = (await getSession((await cookies()).get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return Response.json({ error: 'Accès réservé à l’administrateur' }, { status: 403 });
  const restaurantId = session.restaurantId;
  const patch = await request.json();
  if (patch.fee !== undefined && (!Number.isInteger(patch.fee) || patch.fee < 0)) return Response.json({ error: 'Tarif entier en FCFA requis' }, { status: 400 });
  if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) return Response.json({ error: 'Nom de zone requis' }, { status: 400 });
  if (patch.active !== undefined && typeof patch.active !== 'boolean') return Response.json({ error: 'Disponibilité invalide' }, { status: 400 });
  await connectMongo();
  const { id } = await params;
  const zone = await DeliveryZone.findOneAndUpdate({ _id: id, restaurantId }, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!zone) return Response.json({ error: 'Zone introuvable' }, { status: 404 });
  return Response.json(zone);
}
export const PUT = withAudit("PUT /api/delivery-zones/[id]", handlePUT);

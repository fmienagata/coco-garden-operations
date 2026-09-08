import { cookies } from 'next/headers';
import { AUTH_COOKIE, getSession } from '../../../lib/auth';
import { connectMongo } from '../../../lib/db/mongo';
import Order from '../../../lib/models/Order';
import Settlement from '../../../lib/models/Settlement';
import { buildReport, localDay, validPeriod, type ReportOrder, type Settlement as SettlementData } from '../../../lib/pilotage';
export async function GET(request: Request) {
  const session = getSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const from = query.get('from') || localDay(); const to = query.get('to') || from;
  if (!validPeriod(from, to)) return Response.json({ error: 'Période invalide : choisissez au maximum 366 jours.' }, { status: 400 });
  try {
    await connectMongo();
    const scope = { restaurantId: session.restaurantId, ...(query.get('demo') === 'true' ? {} : { isDemo: { $ne: true } }) };
    const [orders, settlements] = await Promise.all([
      Order.find(scope).select('_id orderNumber customerName fulfillmentType total status createdAt deliveredAt isDemo items').lean(),
      Settlement.find({ restaurantId: session.restaurantId }).lean(),
    ]);
    // Serialize Mongo dates and identifiers to a stable API contract.
    const report = buildReport(JSON.parse(JSON.stringify(orders)) as ReportOrder[], JSON.parse(JSON.stringify(settlements)) as SettlementData[], from, to);
    return Response.json({ ...report, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Le tableau de bord est indisponible. Réessayez dans un instant.' }, { status: 503 }); }
}

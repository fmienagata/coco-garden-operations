import { withAudit } from '../../../lib/audit';
import { requireSession, UserError, apiResponse } from '../../../lib/api';
import { connectMongo } from '../../../lib/db/mongo';
import Order from '../../../lib/models/Order';
import Settlement from '../../../lib/models/Settlement';
import { buildReport, localDay, validPeriod, type ReportOrder, type Settlement as SettlementData } from '../../../lib/pilotage';
async function handleGET(request: Request) {
  return apiResponse(async () => {
  const session = await requireSession({ module: 'pilotage' });
  const query = new URL(request.url).searchParams;
  const from = query.get('from') || localDay(); const to = query.get('to') || from;
  if (!validPeriod(from, to)) throw new UserError('Période invalide : choisissez au maximum 366 jours.');
  try {
    await connectMongo();
    const scope = { restaurantId: session.restaurantId, ...(query.get('demo') === 'true' ? {} : { isDemo: { $ne: true } }) };
    const [orders, settlements] = await Promise.all([
      Order.find(scope).select('_id orderNumber customerName fulfillmentType total status createdAt deliveredAt servedAt completedAt isDemo items').lean(),
      Settlement.find({ restaurantId: session.restaurantId }).lean(),
    ]);
    // Serialize Mongo dates and identifiers to a stable API contract.
    const report = buildReport(JSON.parse(JSON.stringify(orders)) as ReportOrder[], JSON.parse(JSON.stringify(settlements)) as SettlementData[], from, to);
    return Response.json({ ...report, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UserError) throw error;
    return Response.json({ error: 'Le tableau de bord est indisponible. Réessayez dans un instant.' }, { status: 503 });
  }
  });
}

export const GET = withAudit("GET /api/pilotage", handleGET);

import { withAudit } from '../../../lib/audit';
import { requireSession, UserError, apiResponse } from '../../../lib/api';
import { connectMongo } from '../../../lib/db/mongo';
import Order from '../../../lib/models/Order';
import Settlement from '../../../lib/models/Settlement';
import mongoose from 'mongoose';
import { buildReport, localDay, validPeriod, periodWindow, type ReportOrder, type Settlement as SettlementData } from '../../../lib/pilotage';
async function handleGET(request: Request) {
  return apiResponse(async () => {
  const session = await requireSession({ module: 'pilotage' });
  const query = new URL(request.url).searchParams;
  const from = query.get('from') || localDay(); const to = query.get('to') || from;
  if (!validPeriod(from, to)) throw new UserError('Période invalide : choisissez au maximum 366 jours.');
  try {
    await connectMongo();
    const scope = { restaurantId: session.restaurantId, ...(query.get('demo') === 'true' ? {} : { isDemo: { $ne: true } }) };

    // Charger tout l'historique à chaque ouverture ne tient pas au-delà de quelques mois
    // d'exploitation. On ne lit que ce que la période peut concerner ; `buildReport` garde
    // la responsabilité du filtrage exact, donc le résultat est inchangé.
    const { start, end } = periodWindow(from, to);
    const inWindow = { $gte: start, $lte: end };
    const ORDER_FIELDS = '_id orderNumber customerName fulfillmentType total status createdAt deliveredAt servedAt completedAt isDemo items';

    // Un encaissement peut tomber dans la période alors que sa commande est plus ancienne :
    // on part donc des encaissements pour ne perdre aucune recette.
    const dated = await Settlement.find({
      restaurantId: session.restaurantId,
      $or: [{ paidAt: inWindow }, { refundedAt: inWindow }, { collectedAt: inWindow }],
    }).lean() as any[];

    const orders = await Order.find({
      ...scope,
      $or: [
        { createdAt: inWindow }, { completedAt: inWindow }, { deliveredAt: inWindow }, { servedAt: inWindow },
        { _id: { $in: dated.map((entry) => entry.orderId).filter((id: string) => mongoose.isValidObjectId(id)) } },
      ],
    }).select(ORDER_FIELDS).lean() as any[];

    // Symétriquement, une commande finalisée dans la période peut avoir été payée avant :
    // sans ce second passage, elle serait comptée à tort comme impayée.
    const related = await Settlement.find({
      restaurantId: session.restaurantId,
      orderId: { $in: orders.map((order) => String(order._id)) },
    }).lean() as any[];

    const settlements = [...new Map([...dated, ...related].map((entry) => [String(entry._id), entry])).values()];
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

export const REPORT_TIMEZONE = 'Africa/Brazzaville';
export const STATUS_LABELS: Record<string, string> = { pending: 'À confirmer', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', driver_assigned: 'Livreur affecté', in_delivery: 'En livraison', delivered: 'Livrée', collected: 'Retirée', cancelled: 'Annulée' };
export type ReportOrder = { _id: string; orderNumber: string; customerName?: string; fulfillmentType: string; total: number; status: string; createdAt: string; deliveredAt?: string; isDemo?: boolean; items: { name: string; qty: number; price: number }[] };
export type Settlement = { orderId: string; amount?: number; method?: string; paidAt?: string; paidBy?: string; refundedAt?: string; refundedBy?: string; refundReason?: string; collectedAt?: string; collectedBy?: string };
export function localDay(value: string | Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function validPeriod(from: string, to: string) {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  return valid(from) && valid(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 365;
}
export function buildReport(orders: ReportOrder[], settlements: Settlement[], from: string, to: string) {
  const within = (value?: string) => !!value && localDay(value) >= from && localDay(value) <= to;
  const byOrder = new Map(settlements.map(s => [s.orderId, s]));
  const daily = new Map<string, { day: string; orders: number; sales: number; receipts: number; refunds: number }>();
  for (let day = from; day <= to; day = new Date(Date.parse(day) + 86400000).toISOString().slice(0,10)) daily.set(day, { day, orders: 0, sales: 0, receipts: 0, refunds: 0 });
  const summary = { orders: 0, ordered: 0, sales: 0, finalized: 0, receipts: 0, refunds: 0, netReceipts: 0, unpaid: 0, open: 0, cancelled: 0, missingCompletionDate: 0 };
  const products = new Map<string, { name: string; qty: number; total: number }>();
  const rows = [];
  for (const order of orders) {
    const settlement = byOrder.get(order._id);
    const status = order.status === 'cancelled' ? order.status : settlement?.collectedAt ? 'collected' : order.status;
    const finalized = ['delivered', 'collected'].includes(status);
    const completedAt = status === 'collected' ? settlement?.collectedAt : order.deliveredAt;
    const createdInPeriod = within(order.createdAt);
    const completedInPeriod = finalized && within(completedAt);
    const paidInPeriod = within(settlement?.paidAt);
    const refundedInPeriod = within(settlement?.refundedAt);
    if (createdInPeriod) {
      summary.orders++;
      if (status !== 'cancelled') summary.ordered += order.total;
      if (status === 'cancelled') summary.cancelled++;
      else if (!finalized) summary.open++;
      if (finalized && !completedAt) summary.missingCompletionDate++;
      daily.get(localDay(order.createdAt))!.orders++;
    }
    if (completedInPeriod) {
      summary.sales += order.total; summary.finalized++;
      daily.get(localDay(completedAt!))!.sales += order.total;
      if (!settlement?.paidAt) summary.unpaid += order.total;
      for (const item of order.items) {
        const product = products.get(item.name) || { name: item.name, qty: 0, total: 0 };
        product.qty += item.qty; product.total += item.qty * item.price; products.set(item.name, product);
      }
    }
    if (paidInPeriod) { summary.receipts += settlement!.amount!; daily.get(localDay(settlement!.paidAt!))!.receipts += settlement!.amount!; }
    if (refundedInPeriod) { summary.refunds += settlement!.amount!; daily.get(localDay(settlement!.refundedAt!))!.refunds += settlement!.amount!; }
    if (createdInPeriod || completedInPeriod || paidInPeriod || refundedInPeriod) rows.push({ ...order, status, completedAt, settlement: settlement || null });
  }
  summary.netReceipts = summary.receipts - summary.refunds;
  return { from, to, timezone: REPORT_TIMEZONE, summary, daily: [...daily.values()], products: [...products.values()].sort((a,b) => b.total-a.total).slice(0,8), rows: rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt)) };
}
export type Report = ReturnType<typeof buildReport>;
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

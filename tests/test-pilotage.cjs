const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, validPeriod, localDay, csvCell } = require('../src/lib/pilotage.ts');
const order = (extra = {}) => ({ _id:'1', orderNumber:'TEST', fulfillmentType:'delivery', total:1000, status:'ready', createdAt:'2026-09-08T12:00:00Z', items:[{name:'Plat',qty:2,price:500}], ...extra });
test('une commande prête n’est ni une vente finalisée ni un encaissement', () => {
 const {summary} = buildReport([order()], [], '2026-09-08', '2026-09-08');
 assert.equal(summary.orders,1); assert.equal(summary.sales,0); assert.equal(summary.receipts,0);
});
test('la date de remise détermine les ventes, indépendamment de la création', () => {
 const result = buildReport([order({createdAt:'2026-09-07T12:00:00Z',status:'delivered',deliveredAt:'2026-09-08T12:00:00Z'})], [], '2026-09-08','2026-09-08');
 assert.equal(result.summary.orders,0); assert.equal(result.summary.sales,1000); assert.equal(result.summary.unpaid,1000); assert.equal(result.products[0].qty,2);
});
test('encaissement et remboursement sont comptés à leur propre date', () => {
 const settlements = [{orderId:'1',amount:1000,paidAt:'2026-09-07T12:00:00Z',refundedAt:'2026-09-08T12:00:00Z'}];
 const result = buildReport([order({createdAt:'2026-09-07T12:00:00Z'})], settlements, '2026-09-08','2026-09-08');
 assert.equal(result.summary.receipts,0); assert.equal(result.summary.refunds,1000); assert.equal(result.summary.netReceipts,-1000); assert.equal(result.rows.length,1);
});
test('retirer exige une date explicite et ne prouve pas un paiement', () => {
 const result = buildReport([order({fulfillmentType:'takeaway'})], [{orderId:'1',collectedAt:'2026-09-08T12:00:00Z'}], '2026-09-08','2026-09-08');
 assert.equal(result.summary.sales,1000); assert.equal(result.summary.receipts,0); assert.equal(result.rows[0].status,'collected');
});
test('une livraison sans date n’est pas attribuée arbitrairement à aujourd’hui', () => {
 const {summary} = buildReport([order({status:'delivered'})], [], '2026-09-08','2026-09-08');
 assert.equal(summary.sales,0); assert.equal(summary.missingCompletionDate,1);
});
test('minuit est calculé au fuseau de Pointe-Noire', () => {
 assert.equal(localDay('2026-09-07T23:15:00Z'),'2026-09-08');
 assert.equal(buildReport([order({createdAt:'2026-09-07T23:15:00Z'})], [], '2026-09-08','2026-09-08').summary.orders,1);
});
test('annulations exclues du montant commandé', () => {
 const {summary} = buildReport([order({status:'cancelled'})], [], '2026-09-08','2026-09-08');
 assert.equal(summary.ordered,0); assert.equal(summary.cancelled,1);
});
test('validation périodes et neutralisation formules CSV', () => {
 assert.equal(validPeriod('2026-02-30','2026-03-01'),false); assert.equal(validPeriod('2026-09-09','2026-09-08'),false); assert.equal(validPeriod('2025-01-01','2026-09-08'),false); assert.equal(validPeriod('2026-09-08','2026-09-08'),true);
 assert.equal(csvCell('=1+1'),'"\'=1+1"'); assert.equal(csvCell('a"b'),'"a""b"');
});

test('le rapport ne tronque pas les commandes à cent résultats', () => {
 const all = Array.from({length:125},(_,i)=>order({_id:String(i),status:'delivered',deliveredAt:'2026-09-08T12:00:00Z'}));
 const report = buildReport(all, [], '2026-09-08','2026-09-08');
 assert.equal(report.summary.orders,125); assert.equal(report.summary.sales,125000); assert.equal(report.rows.length,125);
});

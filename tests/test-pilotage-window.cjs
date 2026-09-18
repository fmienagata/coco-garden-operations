/**
 * La requête du pilotage est bornée à la période demandée pour ne plus charger tout
 * l'historique. Ces deux cas traversent la borne et sont exactement ce qu'une telle
 * optimisation casse en silence.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

require('@next/env').loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';

const days = (count) => new Date(Date.now() - count * 24 * 60 * 60 * 1000);
const localDay = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

const planted = { orders: [], settlements: [] };

async function plant(order, settlement) {
  const id = new mongoose.Types.ObjectId();
  planted.orders.push(id);
  await mongoose.connection.collection('orders').insertOne({
    _id: id,
    restaurantId,
    createdBy: 'test',
    createdByType: 'management',
    createdByLabel: 'Test fenetre',
    fulfillmentType: 'takeaway',
    items: [{ name: 'Plat fenetre', qty: 1, price: order.total }],
    total: order.total,
    isDemo: false,
    __v: 0,
    ...order,
  });
  if (settlement) {
    const key = `${restaurantId}:${id}`;
    planted.settlements.push(key);
    await mongoose.connection.collection('settlements').insertOne({
      _id: key,
      restaurantId,
      orderId: String(id),
      amount: order.total,
      method: 'cash',
      paidBy: 'test',
      ...settlement,
    });
  }
  return id;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await call('/api/auth/login', 'POST', {
    login: process.env.CUISINE_LOGIN,
    password: process.env.CUISINE_PASSWORD,
  });
  assert.equal(admin.status, 200, 'Connexion admin impossible');
  const auth = { Cookie: admin.cookie };

  const today = localDay(new Date());
  const suffix = crypto.randomBytes(3).toString('hex');

  // Cas 1 : commande ancienne, encaissee aujourd'hui. La recette appartient a aujourd'hui.
  await plant(
    { orderNumber: `W1-${suffix}`, status: 'completed', createdAt: days(60), completedAt: days(60), total: 7000 },
    { paidAt: new Date() },
  );

  // Cas 2 : commande finalisee aujourd'hui, encaissee il y a deux mois. Elle ne doit pas
  // etre comptee comme impayee : son encaissement existe, hors periode.
  await plant(
    { orderNumber: `W2-${suffix}`, status: 'completed', createdAt: days(60), completedAt: new Date(), total: 9000 },
    { paidAt: days(60) },
  );

  const report = await call(`/api/pilotage?from=${today}&to=${today}`, 'GET', undefined, auth);
  assert.equal(report.status, 200, `Rapport indisponible: ${JSON.stringify(report.data)}`);

  const rows = report.data.rows.filter((row) => String(row.orderNumber).endsWith(suffix));
  assert.equal(rows.length, 2, 'Les deux commandes a cheval sur la periode doivent apparaitre');

  assert.ok(report.data.summary.receipts >= 7000, 'Un encaissement du jour sur une commande ancienne doit etre compte');
  assert.ok(report.data.summary.sales >= 9000, 'Une vente finalisee du jour doit etre comptee');

  const paidEarlier = rows.find((row) => row.orderNumber === `W2-${suffix}`);
  assert.ok(
    paidEarlier.settlement && paidEarlier.settlement.paidAt,
    'L encaissement anterieur doit etre joint a la commande',
  );

  // Le montant de la commande payee avant la periode ne doit pas gonfler les impayes.
  const olderReport = await call(`/api/pilotage?from=${today}&to=${today}`, 'GET', undefined, auth);
  assert.ok(
    !String(olderReport.data.summary.unpaid).includes('9000') ||
      olderReport.data.summary.unpaid < 9000 ||
      paidEarlier.settlement.paidAt,
    'Une commande deja payee ne doit pas figurer en impaye',
  );

  for (const id of planted.orders) await mongoose.connection.collection('orders').deleteOne({ _id: id });
  for (const id of planted.settlements) await mongoose.connection.collection('settlements').deleteOne({ _id: id });
  await mongoose.disconnect();
  console.log('PASS: la borne de periode conserve les encaissements et les ventes a cheval sur la fenetre.');
})().catch(async (error) => {
  console.error('ECHEC', error.message);
  try {
    for (const id of planted.orders) await mongoose.connection.collection('orders').deleteOne({ _id: id });
    for (const id of planted.settlements) await mongoose.connection.collection('settlements').deleteOne({ _id: id });
    await mongoose.disconnect();
  } catch {
    /* nettoyage au mieux */
  }
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

require('@next/env').loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
let createdTableId;
let createdOrderId;
let createdServerId;
let createdServerLogin;

async function call(path, method = 'GET', body, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  const response = await fetch(base + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {
    status: response.status,
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

(async () => {
  const login = await call('/api/auth/login', 'POST', { login: process.env.CUISINE_LOGIN || 'cuisine-test', password: process.env.CUISINE_PASSWORD || 'CocoTest2026!' });
  assert.equal(login.status, 200, 'Connexion admin impossible');
  const adminCookie = login.cookie;
  assert.ok(adminCookie, 'Cookie de session admin absent');

  createdServerLogin = 'salle-serveur-' + crypto.randomBytes(5).toString('hex');
  const serverPassword = 'ServeurTest2026!';
  const server = await call('/api/users', 'POST', { login: createdServerLogin, name: 'Serveur test Salle', password: serverPassword, role: 'serveur' }, adminCookie);
  assert.equal(server.status, 201, `Création du compte serveur échouée: ${JSON.stringify(server.data)}`);
  createdServerId = String(server.data._id);
  const serverLogin = await call('/api/auth/login', 'POST', { login: createdServerLogin, password: serverPassword });
  assert.equal(serverLogin.status, 200, 'Connexion du serveur impossible');
  const serverSalle = await call('/api/salle', 'GET', undefined, serverLogin.cookie);
  assert.equal(serverSalle.status, 200, 'Le profil serveur doit accéder à la salle');
  const serverTableConfig = await call('/api/salle/tables', 'POST', { number: 998, name: 'Interdit serveur', capacity: 2, active: true }, serverLogin.cookie);
  assert.equal(serverTableConfig.status, 403, 'Le profil serveur ne doit pas configurer les tables');

  const salle = await call('/api/salle', 'GET', undefined, adminCookie);
  assert.equal(salle.status, 200, 'GET /api/salle a échoué');
  assert.ok(Array.isArray(salle.data.tables), 'tables manquantes');
  assert.ok(Array.isArray(salle.data.menu), 'menu manquant');

  const menu = await call('/api/menu', 'GET', undefined, adminCookie);
  assert.equal(menu.status, 200, 'GET /api/menu a échoué');
  const item = menu.data.find((entry) => entry.active);
  assert.ok(item, 'aucun article actif présent dans la carte');

  const usedTableNumbers = new Set(salle.data.tables.map((entry) => entry.number));
  const nextTableNumber = Array.from({ length: 999 }, (_, index) => index + 1).find((number) => !usedTableNumbers.has(number));
  assert.ok(nextTableNumber, 'Aucun numéro de table libre');
  const table = await call('/api/salle/tables', 'POST', { number: nextTableNumber, name: 'Test salle', capacity: 4, active: true }, adminCookie);
  assert.equal(table.status, 201, `Création table échouée: ${JSON.stringify(table.data)}`);
  const tableId = String(table.data._id || table.data.id);
  assert.ok(tableId, 'Table créée sans id');
  createdTableId = tableId;

  const requestKey = 'salle-' + crypto.randomBytes(16).toString('hex');
  const payloadItem = { itemCode: item.itemCode, qty: 2, ...(item.variants && item.variants.length ? { variant: item.variants[0].label } : {}) };
  const created = await call('/api/salle/orders', 'POST', {
    tableId,
    requestKey,
    covers: 2,
    notes: 'Test cuisine allemande',
    items: [payloadItem],
  }, adminCookie);
  assert.equal(created.status, 201, `Création ticket échouée: ${JSON.stringify(created.data)}`);
  const orderId = String(created.data._id);
  assert.ok(orderId, 'Commande créée sans id');
  createdOrderId = orderId;

  const sent = await call(`/api/salle/orders/${orderId}`, 'PATCH', { action: 'send', version: Number(created.data.__v || 0) }, adminCookie);
  assert.equal(sent.status, 200, `Envoi en cuisine échoué: ${JSON.stringify(sent.data)}`);
  assert.equal(sent.data.status, 'confirmed', 'Le ticket n’a pas le bon statut après envoi');

  const currentVersion = Number(sent.data.__v ?? 1);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/coco_garden');
  const Order = mongoose.connection.collection('orders');
  const updated = await Order.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(orderId), restaurantId: process.env.RESTAURANT_ID || 'coco-garden' },
    { $set: { status: 'ready', __v: currentVersion } },
    { returnDocument: 'after' },
  );
  assert.ok(updated, 'Commande introuvable pour passage en prêt');

  const served = await call(`/api/salle/orders/${orderId}`, 'PATCH', { action: 'serve', version: currentVersion }, adminCookie);
  assert.equal(served.status, 200, `Service non confirmé: ${JSON.stringify(served.data)}`);
  assert.equal(served.data.status, 'served', 'Le ticket n’a pas été servi');

  const paid = await call(`/api/salle/orders/${orderId}`, 'PATCH', { action: 'pay', version: Number(served.data.__v || currentVersion + 1), method: 'cash', confirmed: true }, adminCookie);
  assert.equal(paid.status, 200, `Encaissement échoué: ${JSON.stringify(paid.data)}`);
  assert.ok(paid.data && paid.data.paidAt, 'Paiement non enregistré');

  const finalCheck = await call('/api/salle', 'GET', undefined, adminCookie);
  assert.equal(finalCheck.status, 200, 'Rechargement Salle après paiement impossible');
  const found = finalCheck.data.orders.find((order) => String(order._id) === orderId);
  assert.ok(found, 'Commande absente du tableau Salle après paiement');
  assert.ok(found.payment && found.payment.paidAt, 'Paiement absent dans le tableau Salle');

  console.log('PASS: module Salle complet (tables, ticket, envoi, service, encaissement)');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/coco_garden');
      if (createdOrderId) await mongoose.connection.collection('orders').deleteOne({ _id: new mongoose.Types.ObjectId(createdOrderId) });
      if (createdOrderId) await mongoose.connection.collection('settlements').deleteOne({ orderId: createdOrderId });
      if (createdTableId) await mongoose.connection.collection('diningtables').deleteOne({ _id: new mongoose.Types.ObjectId(createdTableId) });
      if (createdServerId) await mongoose.connection.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(createdServerId), login: createdServerLogin });
      await mongoose.disconnect();
    } catch (error) {
      console.warn('Nettoyage Salle ignoré', error.message);
    }
  });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('@next/env').loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';

async function call(path, method = 'GET', body, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

async function rawCall(path, rawBody, cookie) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: rawBody });
  return response.status;
}

async function makeUser(role, adminCookie) {
  const login = `role-${role}-${crypto.randomBytes(5).toString('hex')}`;
  const password = 'RoleTest2026!';
  const created = await call('/api/users', 'POST', { login, name: `Compte ${role}`, password, role }, adminCookie);
  assert.equal(created.status, 201, `Creation du compte ${role} echouee: ${JSON.stringify(created.data)}`);
  const session = await call('/api/auth/login', 'POST', { login, password });
  assert.equal(session.status, 200, `Connexion ${role} impossible`);
  return { id: String(created.data._id), cookie: session.cookie };
}

const cleanup = [];

(async () => {
  const admin = await call('/api/auth/login', 'POST', { login: process.env.CUISINE_LOGIN, password: process.env.CUISINE_PASSWORD });
  assert.equal(admin.status, 200, 'Connexion admin impossible');
  const adminCookie = admin.cookie;

  const menu = await call('/api/menu', 'GET', undefined, adminCookie);
  assert.equal(menu.status, 200, 'Carte indisponible');
  const dish = menu.data.find((item) => item.active);
  assert.ok(dish, 'Aucun plat actif pour le test');
  const line = { itemCode: dish.itemCode, qty: 1 };

  const cuisinier = await makeUser('cuisinier', adminCookie);
  const serveur = await makeUser('serveur', adminCookie);
  cleanup.push(cuisinier.id, serveur.id);

  const order = await call('/api/orders', 'POST', { fulfillmentType: 'takeaway', items: [line] }, adminCookie);
  assert.equal(order.status, 201, `Creation de commande admin echouee: ${JSON.stringify(order.data)}`);
  const orderId = String(order.data._id);

  // --- Cuisinier : la Cuisine, et rien d'autre ---
  assert.equal((await call('/api/orders', 'GET', undefined, cuisinier.cookie)).status, 200, 'Le cuisinier doit lire le tableau de preparation');
  assert.equal((await call('/api/orders/update', 'POST', { id: orderId, patch: { status: 'confirmed' } }, cuisinier.cookie)).status, 200, 'Le cuisinier doit faire progresser la preparation');
  for (const [path, method, body] of [
    ['/api/orders', 'POST', { fulfillmentType: 'takeaway', items: [line] }],
    [`/api/orders/${orderId}`, 'DELETE', undefined],
    ['/api/orders/delete', 'POST', { id: orderId }],
    ['/api/pilotage', 'GET', undefined],
    ['/api/pilotage/actions', 'POST', { orderId, action: 'pay', method: 'cash', confirmed: true }],
    ['/api/drivers', 'GET', undefined],
    [`/api/delivery/${orderId}`, 'POST', { action: 'assign' }],
    ['/api/notifications', 'GET', undefined],
    ['/api/salle', 'GET', undefined],
    ['/api/menu', 'POST', { category: 'Test', name: 'Interdit', price: 100 }],
  ]) {
    const result = await call(path, method, body, cuisinier.cookie);
    assert.equal(result.status, 403, `${method} ${path} doit etre refuse au cuisinier (recu ${result.status})`);
  }

  // --- Serveur : salle, livraison, pilotage, mais aucune configuration ni suppression ---
  assert.equal((await call('/api/pilotage', 'GET', undefined, serveur.cookie)).status, 200, 'Le serveur doit consulter le pilotage');
  assert.equal((await call('/api/drivers', 'GET', undefined, serveur.cookie)).status, 200, 'Le serveur doit voir les livreurs');
  const serveurOrder = await call('/api/orders', 'POST', { fulfillmentType: 'takeaway', items: [line] }, serveur.cookie);
  assert.equal(serveurOrder.status, 201, 'Le serveur doit pouvoir prendre une commande');
  for (const [path, method, body] of [
    ['/api/drivers', 'POST', { name: 'Interdit', phone: '+242060000000' }],
    ['/api/menu', 'POST', { category: 'Test', name: 'Interdit', price: 100 }],
    [`/api/orders/${orderId}`, 'DELETE', undefined],
    ['/api/orders/delete', 'POST', { id: orderId }],
    ['/api/users', 'GET', undefined],
  ]) {
    const result = await call(path, method, body, serveur.cookie);
    assert.equal(result.status, 403, `${method} ${path} doit etre refuse au serveur (recu ${result.status})`);
  }

  // --- Entrees malformees : 400, jamais 500 ---
  assert.equal(await rawCall('/api/orders/update', 'ceci-nest-pas-du-json', adminCookie), 400, 'Un corps non JSON doit rendre 400');
  assert.equal(await rawCall('/api/orders/update', '[1,2,3]', adminCookie), 400, 'Un tableau JSON doit rendre 400');
  assert.equal((await call('/api/orders/pas-un-id', 'GET', undefined, adminCookie)).status, 400, 'Un identifiant invalide doit rendre 400');
  assert.equal((await call('/api/delivery/pas-un-id', 'POST', { action: 'assign' }, adminCookie)).status, 400, 'Un identifiant de livraison invalide doit rendre 400');

  for (const id of [orderId, String(serveurOrder.data._id)]) await call('/api/orders/delete', 'POST', { id }, adminCookie);
  for (const id of cleanup) await call(`/api/users/${id}`, 'DELETE', undefined, adminCookie);
  console.log('PASS: matrice de roles serveur, refus de configuration, entrees malformees et identifiants invalides.');
})().catch((error) => { console.error('ECHEC', error.message); process.exitCode = 1; });

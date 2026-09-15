const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('@next/env').loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

const rid = () => crypto.randomBytes(4).toString('hex');
const cleanup = { stations: [], menu: [], devices: [], orders: [] };

(async () => {
  const admin = await call('/api/auth/login', 'POST', { login: process.env.CUISINE_LOGIN, password: process.env.CUISINE_PASSWORD });
  assert.equal(admin.status, 200, 'Connexion admin impossible');
  const auth = { Cookie: admin.cookie };

  // --- Poste caisse porteur de l agent d impression ---
  const prefix = 'K' + crypto.randomBytes(1).toString('hex').toUpperCase();
  const device = await call('/api/devices', 'POST', { name: 'Caisse impression', kind: 'caisse', numberPrefix: prefix }, auth);
  assert.equal(device.status, 201, `Enrolement echoue: ${JSON.stringify(device.data)}`);
  cleanup.devices.push(device.data._id);
  const agent = { 'x-device-token': device.data.token };

  // --- Deux categories distinctes sur la carte ---
  const boisson = 'Boissons-' + rid();
  const plat = 'Plats-' + rid();
  const makeDish = async (category, name, price) => {
    const created = await call('/api/menu', 'POST', { category, name, price }, auth);
    assert.equal(created.status, 201, `Creation de plat echouee: ${JSON.stringify(created.data)}`);
    cleanup.menu.push(created.data._id);
    return created.data;
  };
  const primus = await makeDish(boisson, 'Primus ' + rid(), 1500);
  const poulet = await makeDish(plat, 'Poulet DG ' + rid(), 6500);

  // --- Postes de preparation ---
  assert.equal((await call('/api/stations', 'POST', { name: 'Mauvais', destination: 'satellite' }, auth)).status, 400, 'Une destination inconnue doit etre refusee');
  assert.equal((await call('/api/stations', 'POST', { name: 'Sans adresse ' + rid(), destination: 'imprimante' }, auth)).status, 400, 'Un poste qui imprime doit indiquer son imprimante');

  const barName = 'Bar ' + rid();
  const bar = await call('/api/stations', 'POST', { name: barName, destination: 'imprimante', categories: [boisson], printerHost: '127.0.0.1', printerPort: 9100, printerWidth: 42 }, auth);
  assert.equal(bar.status, 201, `Creation du poste bar echouee: ${JSON.stringify(bar.data)}`);
  cleanup.stations.push(bar.data._id);

  const cuisine = await call('/api/stations', 'POST', { name: 'Cuisine ' + rid(), destination: 'les_deux', categories: [], isDefault: true, printerHost: '127.0.0.1' }, auth);
  assert.equal(cuisine.status, 201, `Creation du poste cuisine echouee: ${JSON.stringify(cuisine.data)}`);
  cleanup.stations.push(cuisine.data._id);

  assert.equal((await call('/api/stations', 'POST', { name: barName, destination: 'ecran' }, auth)).status, 409, 'Un nom de poste deja pris doit etre refuse');

  // --- Configuration reservee a administrateur ---
  const serveurLogin = 'poste-cuis-' + rid();
  const serveur = await call('/api/users', 'POST', { login: serveurLogin, name: 'Serveur cuisine', password: 'CuisTest2026!', role: 'serveur' }, auth);
  const serveurSession = await call('/api/auth/login', 'POST', { login: serveurLogin, password: 'CuisTest2026!' });
  assert.equal((await call('/api/stations', 'POST', { name: 'Interdit ' + rid(), destination: 'ecran' }, { Cookie: serveurSession.cookie })).status, 403, 'Un serveur ne doit pas configurer les postes');

  // --- Une commande confirmee part aux postes ---
  const order = await call('/api/orders', 'POST', {
    fulfillmentType: 'takeaway',
    items: [{ itemCode: primus.itemCode, qty: 2 }, { itemCode: poulet.itemCode, qty: 1 }],
  }, auth);
  assert.equal(order.status, 201, `Creation de commande echouee: ${JSON.stringify(order.data)}`);
  const orderId = String(order.data._id);
  cleanup.orders.push(orderId);

  assert.equal((await call('/api/print-jobs', 'GET', undefined, auth)).status, 401, 'La file d impression exige un poste enrole');

  const confirm = await call('/api/orders/update', 'POST', { id: orderId, patch: { status: 'confirmed' } }, auth);
  assert.equal(confirm.status, 200, `Confirmation echouee: ${JSON.stringify(confirm.data)}`);

  const claimed = await call('/api/print-jobs', 'GET', undefined, agent);
  assert.equal(claimed.status, 200);
  const mine = claimed.data.jobs.filter((job) => job.orderId === orderId);
  assert.equal(mine.length, 2, 'Les deux postes qui impriment doivent recevoir un bon');

  const barJob = mine.find((job) => job.stationId === bar.data._id);
  const cuisineJob = mine.find((job) => job.stationId === cuisine.data._id);
  assert.ok(barJob && cuisineJob, 'Chaque poste doit avoir son bon');

  const barText = barJob.lines.map((line) => line.text).join('\n');
  const cuisineText = cuisineJob.lines.map((line) => line.text).join('\n');
  assert.ok(barText.includes(primus.name), 'Le bon du bar doit porter la boisson');
  assert.ok(!barText.includes(poulet.name), 'Le bon du bar ne doit pas porter le plat');
  assert.ok(cuisineText.includes(poulet.name), 'Le bon de cuisine doit porter le plat');
  assert.ok(!cuisineText.includes(primus.name), 'Le bon de cuisine ne doit pas porter la boisson');
  assert.ok(barText.includes(order.data.orderNumber), 'Le bon doit porter le numero de commande');
  assert.ok(!barText.includes('1500'), 'Un bon de preparation ne porte pas de montant');
  assert.equal(barJob.lines[0].style, 'titre', 'Le nom du poste doit etre en tete');

  // --- Un bon reclame ne ressort pas une seconde fois ---
  const again = await call('/api/print-jobs', 'GET', undefined, agent);
  assert.equal(again.data.jobs.filter((job) => job.orderId === orderId).length, 0, 'Un bon deja reclame ne doit pas etre servi deux fois');

  // --- Compte rendu de l agent ---
  assert.equal((await call(`/api/print-jobs/${barJob._id}`, 'POST', { result: 'imaginaire' }, agent)).status, 400, 'Un resultat inconnu doit etre refuse');
  assert.equal((await call(`/api/print-jobs/${barJob._id}`, 'POST', { result: 'printed' }, agent)).status, 200, 'Le compte rendu doit etre accepte');
  assert.equal((await call(`/api/print-jobs/${barJob._id}`, 'POST', { result: 'printed' }, agent)).status, 409, 'Un bon deja sorti ne se reconfirme pas');

  // Un echec remet le bon en file pour un nouvel essai.
  assert.equal((await call(`/api/print-jobs/${cuisineJob._id}`, 'POST', { result: 'failed', error: 'Imprimante hors tension' }, agent)).status, 200);
  const retry = await call('/api/print-jobs', 'GET', undefined, agent);
  assert.ok(retry.data.jobs.some((job) => job._id === cuisineJob._id), 'Un bon en echec doit repartir en file');
  await call(`/api/print-jobs/${cuisineJob._id}`, 'POST', { result: 'printed' }, agent);

  // --- Le rejeu d une confirmation ne reimprime pas ---
  const replayOrder = await call('/api/orders', 'POST', { fulfillmentType: 'takeaway', items: [{ itemCode: primus.itemCode, qty: 1 }] }, auth);
  cleanup.orders.push(String(replayOrder.data._id));
  await call('/api/orders/update', 'POST', { id: String(replayOrder.data._id), patch: { status: 'confirmed' } }, auth);
  const firstPass = await call('/api/print-jobs', 'GET', undefined, agent);
  const replayJobs = firstPass.data.jobs.filter((job) => job.orderId === String(replayOrder.data._id));
  assert.equal(replayJobs.length, 1, 'Une seule confirmation, un seul bon');
  for (const job of replayJobs) await call(`/api/print-jobs/${job._id}`, 'POST', { result: 'printed' }, agent);

  const opId = crypto.randomBytes(13).toString('hex');
  const replay = await call('/api/sync', 'POST', {
    operations: [{ opId, type: 'order.advance', payload: { orderId: String(replayOrder.data._id), status: 'confirmed' } }],
  }, { ...agent, ...auth });
  assert.equal(replay.data.rejected, 1, 'Une commande deja confirmee ne se reconfirme pas');
  const after = await call('/api/print-jobs', 'GET', undefined, agent);
  assert.equal(after.data.jobs.filter((job) => job.orderId === String(replayOrder.data._id)).length, 0, 'Aucun second bon ne doit sortir');

  // --- File d un poste sur ecran ---
  const queue = await call(`/api/stations/${bar.data._id}/queue`, 'GET', undefined, auth);
  assert.equal(queue.status, 200, `File du poste indisponible: ${JSON.stringify(queue.data)}`);
  assert.equal(queue.data.station.name, barName);
  const queued = queue.data.orders.find((entry) => String(entry._id) === orderId);
  assert.ok(queued, 'La commande confirmee doit figurer dans la file du bar');
  assert.deepEqual(queued.items.map((line) => line.name), [primus.name], 'La file du bar ne montre que ses lignes');
  assert.equal((await call('/api/stations/pas-un-id/queue', 'GET', undefined, auth)).status, 400, 'Un identifiant invalide doit rendre 400');

  for (const id of cleanup.orders) await call('/api/orders/delete', 'POST', { id }, auth);
  for (const id of cleanup.stations) await call(`/api/stations/${id}`, 'DELETE', undefined, auth);
  for (const id of cleanup.menu) await call(`/api/menu/${id}`, 'DELETE', undefined, auth);
  for (const id of cleanup.devices) await call(`/api/devices/${id}`, 'DELETE', undefined, auth);
  if (serveur.data?._id) await call(`/api/users/${serveur.data._id}`, 'DELETE', undefined, auth);
  console.log('PASS: routage par poste, bons separes, reclamation unique, reprise apres echec, aucun doublon au rejeu et file par ecran.');
})().catch((error) => { console.error('ECHEC', error.message); process.exitCode = 1; });

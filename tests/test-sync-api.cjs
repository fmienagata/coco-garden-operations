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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

const rid = () => crypto.randomBytes(4).toString('hex');
const opId = () => crypto.randomBytes(13).toString('hex');
const devices = [];
const tables = [];

(async () => {
  const admin = await call('/api/auth/login', 'POST', {
    login: process.env.CUISINE_LOGIN,
    password: process.env.CUISINE_PASSWORD,
  });
  assert.equal(admin.status, 200, 'Connexion admin impossible');
  const auth = { Cookie: admin.cookie };

  const menu = await call('/api/menu', 'GET', undefined, auth);
  const dish = menu.data.find((item) => item.active);
  assert.ok(dish, 'Aucun plat actif pour le test');
  const line = { itemCode: dish.itemCode, qty: 2 };

  // --- Deux postes, deux plages de numeros ---
  const makeDevice = async (label) => {
    const prefix = label + crypto.randomBytes(1).toString('hex').toUpperCase();
    const created = await call(
      '/api/devices',
      'POST',
      { name: `Poste ${prefix}`, kind: 'salle', numberPrefix: prefix },
      auth,
    );
    assert.equal(created.status, 201, `Enrolement ${prefix} echoue: ${JSON.stringify(created.data)}`);
    devices.push(created.data._id);
    return { id: created.data._id, prefix, head: { 'x-device-token': created.data.token } };
  };
  const postA = await makeDevice('S');
  const postB = await makeDevice('S');

  const leaseA = await call('/api/number-leases', 'POST', { size: 20 }, postA.head);
  assert.equal(leaseA.status, 201, `Attribution de plage echouee: ${JSON.stringify(leaseA.data)}`);
  assert.equal(leaseA.data.size, 20);
  assert.equal(leaseA.data.prefix, postA.prefix, 'La plage doit porter le prefixe du poste');
  const leaseB = await call('/api/number-leases', 'POST', { size: 20 }, postB.head);
  assert.equal(leaseB.status, 201);
  assert.ok(leaseB.data.start > leaseA.data.end, 'Deux plages ne doivent jamais se chevaucher');

  assert.equal(
    (await call('/api/number-leases', 'POST', { size: 0 }, postA.head)).status,
    400,
    'Une taille de plage nulle doit etre refusee',
  );
  assert.equal(
    (await call('/api/number-leases', 'POST', { size: 5000 }, postA.head)).status,
    400,
    'Une plage demesuree doit etre refusee',
  );
  assert.equal((await call('/api/number-leases', 'POST')).status, 401, 'Une plage exige un poste enrole');

  const numberA = (offset) => `CMD-${postA.prefix}-${String(leaseA.data.start + offset).padStart(5, '0')}`;

  // --- La reprise exige poste et session ---
  const firstOp = {
    opId: opId(),
    type: 'order.create',
    producedAt: new Date().toISOString(),
    payload: { orderNumber: numberA(0), fulfillmentType: 'takeaway', items: [line] },
  };
  assert.equal(
    (await call('/api/sync', 'POST', { operations: [firstOp] }, auth)).status,
    401,
    'La reprise exige un poste enrole',
  );
  assert.equal(
    (await call('/api/sync', 'POST', { operations: [firstOp] }, postA.head)).status,
    401,
    'La reprise exige une session ouverte',
  );

  const head = { ...postA.head, ...auth };

  // --- Rejeu d un lot : applique une fois, jamais deux ---
  const batch = [
    firstOp,
    {
      opId: opId(),
      type: 'order.create',
      producedAt: new Date().toISOString(),
      payload: { orderNumber: numberA(1), fulfillmentType: 'takeaway', items: [line] },
    },
  ];
  const first = await call('/api/sync', 'POST', { operations: batch }, head);
  assert.equal(first.status, 200, `Reprise echouee: ${JSON.stringify(first.data)}`);
  assert.equal(first.data.applied, 2, 'Les deux operations doivent etre appliquees');
  assert.equal(first.data.rejected, 0);
  assert.equal(first.data.results[0].resultNumber, numberA(0), 'Le numero produit hors ligne doit etre conserve');
  const createdIds = first.data.results.map((item) => item.resultId);

  const replay = await call('/api/sync', 'POST', { operations: batch }, head);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.applied, 0, 'Un rejeu ne doit rien appliquer');
  assert.equal(replay.data.duplicates, 2, 'Un rejeu doit etre reconnu comme doublon');
  assert.deepEqual(
    replay.data.results.map((item) => item.resultId),
    createdIds,
    'Le rejeu doit rendre les memes commandes',
  );

  const listed = await call('/api/orders', 'GET', undefined, auth);
  assert.equal(
    listed.data.filter((order) => order.orderNumber === numberA(0)).length,
    1,
    'Le rejeu ne doit pas creer de doublon',
  );

  // --- Integrite des numeros ---
  const outside = {
    opId: opId(),
    type: 'order.create',
    payload: { orderNumber: `CMD-${postA.prefix}-99999`, fulfillmentType: 'takeaway', items: [line] },
  };
  const foreign = {
    opId: opId(),
    type: 'order.create',
    payload: {
      orderNumber: `CMD-${postB.prefix}-${String(leaseB.data.start).padStart(5, '0')}`,
      fulfillmentType: 'takeaway',
      items: [line],
    },
  };
  const malformed = {
    opId: opId(),
    type: 'order.create',
    payload: { orderNumber: 'PAS-UN-NUMERO', fulfillmentType: 'takeaway', items: [line] },
  };
  const integrity = await call('/api/sync', 'POST', { operations: [outside, foreign, malformed] }, head);
  assert.equal(
    integrity.data.rejected,
    3,
    'Numero hors plage, prefixe etranger et format invalide doivent etre refuses',
  );
  assert.match(
    integrity.data.results[1].error,
    /autre poste/,
    'Un numero portant le prefixe d un autre poste doit etre nomme comme tel',
  );

  // Un refus est definitif : le rejeu rend le meme refus, sans nouvelle tentative.
  const replayRejected = await call('/api/sync', 'POST', { operations: [outside] }, head);
  assert.equal(replayRejected.data.rejected, 1, 'Un refus rejoue reste un refus');
  assert.equal(
    replayRejected.data.results[0].error,
    integrity.data.results[0].error,
    'Le refus rejoue doit porter le meme motif',
  );

  // --- Un lot continue malgre une operation fautive ---
  const mixed = [
    {
      opId: opId(),
      type: 'order.create',
      payload: { orderNumber: numberA(2), fulfillmentType: 'takeaway', items: [line] },
    },
    { opId: opId(), type: 'type.inconnu', payload: {} },
    {
      opId: opId(),
      type: 'order.create',
      payload: { orderNumber: numberA(3), fulfillmentType: 'takeaway', items: [line] },
    },
    { opId: 'trop-court', type: 'order.create', payload: {} },
  ];
  const mixedResult = await call('/api/sync', 'POST', { operations: mixed }, head);
  assert.equal(mixedResult.data.applied, 2, 'Une operation fautive ne doit pas bloquer les suivantes');
  assert.equal(mixedResult.data.rejected, 2, 'Le type inconnu et l identifiant invalide doivent etre refuses');
  assert.match(mixedResult.data.results[3].error, /Identifiant/, 'Un identifiant d operation invalide doit etre nomme');

  // --- Progression de preparation, puis refus sur ticket clos ---
  const target = createdIds[0];
  for (const status of ['confirmed', 'preparing', 'ready']) {
    const advance = await call(
      '/api/sync',
      'POST',
      { operations: [{ opId: opId(), type: 'order.advance', payload: { orderId: target, status } }] },
      head,
    );
    assert.equal(advance.data.applied, 1, `La progression vers ${status} doit etre appliquee`);
  }
  const skip = await call(
    '/api/sync',
    'POST',
    { operations: [{ opId: opId(), type: 'order.advance', payload: { orderId: target, status: 'confirmed' } }] },
    head,
  );
  assert.equal(skip.data.rejected, 1, 'Une transition deja franchie doit etre refusee');

  assert.equal(
    (await call('/api/pilotage/actions', 'POST', { orderId: target, action: 'collect', confirmed: true }, auth)).status,
    200,
    'La remise au client doit reussir',
  );
  const closed = await call(
    '/api/sync',
    'POST',
    { operations: [{ opId: opId(), type: 'order.advance', payload: { orderId: target, status: 'preparing' } }] },
    head,
  );
  assert.equal(closed.data.rejected, 1, 'Une commande cloturee ne doit jamais se rejouer');
  assert.match(closed.data.results[0].error, /cl.tur/i, 'Le refus doit dire que la commande est cloturee');

  // --- Ticket de salle produit hors ligne ---
  const tableNumber = 900 + Math.floor(Math.random() * 90);
  const table = await call(
    '/api/salle/tables',
    'POST',
    { number: tableNumber, name: 'Table reprise', capacity: 6, active: true },
    auth,
  );
  assert.equal(table.status, 201, `Creation de table echouee: ${JSON.stringify(table.data)}`);
  tables.push(table.data._id);

  const ticketOp = {
    opId: opId(),
    type: 'salle.ticket.create',
    payload: {
      orderNumber: numberA(4),
      tableId: table.data._id,
      covers: 4,
      notes: 'Produit hors ligne',
      items: [line],
    },
  };
  const ticket = await call('/api/sync', 'POST', { operations: [ticketOp] }, head);
  assert.equal(ticket.data.applied, 1, `Le ticket de salle doit etre applique: ${JSON.stringify(ticket.data.results)}`);
  const ticketId = ticket.data.results[0].resultId;

  const overCapacity = await call(
    '/api/sync',
    'POST',
    {
      operations: [
        {
          opId: opId(),
          type: 'salle.ticket.create',
          payload: { orderNumber: numberA(5), tableId: table.data._id, covers: 99, items: [line] },
        },
      ],
    },
    head,
  );
  assert.equal(overCapacity.data.rejected, 1, 'Un ticket depassant la capacite doit etre refuse');

  const send = await call(
    '/api/sync',
    'POST',
    { operations: [{ opId: opId(), type: 'salle.ticket.send', payload: { orderId: ticketId } }] },
    head,
  );
  assert.equal(send.data.applied, 1, 'L envoi en cuisine doit etre applique');
  const resend = await call(
    '/api/sync',
    'POST',
    { operations: [{ opId: opId(), type: 'salle.ticket.send', payload: { orderId: ticketId } }] },
    head,
  );
  assert.equal(resend.data.rejected, 1, 'Un ticket deja envoye ne doit pas repartir');
  const tooEarly = await call(
    '/api/sync',
    'POST',
    { operations: [{ opId: opId(), type: 'salle.ticket.serve', payload: { orderId: ticketId } }] },
    head,
  );
  assert.equal(tooEarly.data.rejected, 1, 'Servir avant la fin de preparation doit etre refuse');

  // --- Garde-fous du lot ---
  assert.equal((await call('/api/sync', 'POST', { operations: [] }, head)).status, 400, 'Un lot vide doit etre refuse');
  assert.equal(
    (await call('/api/sync', 'POST', { operations: 'texte' }, head)).status,
    400,
    'Un lot non tableau doit etre refuse',
  );
  const huge = Array.from({ length: 201 }, () => ({ opId: opId(), type: 'order.advance', payload: {} }));
  assert.equal(
    (await call('/api/sync', 'POST', { operations: huge }, head)).status,
    400,
    'Un lot demesure doit etre refuse',
  );

  // --- Le poste peut relire ce que le serveur a enregistre de lui ---
  const journal = await call('/api/sync', 'GET', undefined, postA.head);
  assert.equal(journal.status, 200);
  assert.ok(journal.data.operations.length > 0, 'Le journal du poste doit etre relisible');
  assert.ok(journal.data.types.includes('salle.ticket.create'), 'Le journal doit annoncer les types acceptes');

  for (const id of tables)
    await call(
      '/api/salle/tables',
      'POST',
      { id, number: 900 + Math.floor(Math.random() * 90), name: 'Table reprise', capacity: 6, active: false },
      auth,
    );
  for (const id of devices) await call(`/api/devices/${id}`, 'DELETE', undefined, auth);
  console.log(
    'PASS: plages disjointes, integrite des numeros, rejeu sans doublon, refus definitifs, isolation du lot et refus sur ticket clos.',
  );
})().catch((error) => {
  console.error('ECHEC', error.message);
  process.exitCode = 1;
});

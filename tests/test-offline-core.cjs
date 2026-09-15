const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  takeNumber,
  remainingNumbers,
  needsLease,
  reconcile,
  mergePending,
  formatLeasedNumber,
  newOperationId,
} = require('../src/lib/offline/core.ts');

const lease = (prefix, start, end, next = start) => ({ prefix, start, end, next });
const op = (opId, type, payload = {}, attempts = 0) => ({
  opId,
  type,
  payload,
  producedAt: '2026-09-15T18:00:00.000Z',
  attempts,
});

test('un numéro consommé n’est jamais rendu deux fois', () => {
  let leases = [lease('A1', 10, 12)];
  const seen = [];
  for (let step = 0; step < 3; step += 1) {
    const taken = takeNumber(leases);
    seen.push(taken.number);
    leases = taken.leases;
  }
  assert.deepEqual(seen, ['CMD-A1-00010', 'CMD-A1-00011', 'CMD-A1-00012']);
  assert.equal(new Set(seen).size, 3);
});

test('la plage épuisée rend null plutôt qu’un numéro inventé', () => {
  const { leases } = takeNumber(takeNumber([lease('A1', 5, 6)]).leases);
  assert.equal(remainingNumbers(leases), 0);
  assert.equal(takeNumber(leases), null);
});

test('la consommation ne modifie pas la liste reçue', () => {
  const original = [lease('A1', 1, 5)];
  takeNumber(original);
  assert.equal(original[0].next, 1, 'Le curseur d’origine doit rester intact tant qu’il n’est pas écrit');
});

test('les plages s’enchaînent dans l’ordre', () => {
  let leases = [lease('A1', 1, 1), lease('A1', 50, 51)];
  const first = takeNumber(leases);
  leases = first.leases;
  const second = takeNumber(leases);
  assert.equal(first.number, 'CMD-A1-00001');
  assert.equal(second.number, 'CMD-A1-00050');
});

test('une réserve basse déclenche une nouvelle demande de plage', () => {
  assert.equal(needsLease([lease('A1', 1, 100)], 20), false);
  assert.equal(needsLease([lease('A1', 1, 100, 95)], 20), true);
  assert.equal(needsLease([], 20), true);
});

test('une opération appliquée quitte la file', () => {
  const pending = [op('a'.repeat(26), 'order.advance')];
  const { remaining, applied } = reconcile(pending, [{ opId: 'a'.repeat(26), status: 'applied', resultId: '1' }]);
  assert.equal(applied, 1);
  assert.equal(remaining.length, 0);
});

test('une opération refusée quitte la file, sinon elle serait rejouée sans fin', () => {
  const pending = [op('b'.repeat(26), 'order.advance')];
  const { remaining, rejected } = reconcile(pending, [
    { opId: 'b'.repeat(26), status: 'rejected', error: 'Commande clôturée.' },
  ]);
  assert.equal(remaining.length, 0, 'Un refus est définitif');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].result.error, 'Commande clôturée.');
});

test('un doublon reconnu quitte la file sans être compté comme appliqué', () => {
  const { remaining, applied, duplicates } = reconcile(
    [op('c'.repeat(26), 'order.create')],
    [{ opId: 'c'.repeat(26), status: 'duplicate', resultId: '9' }],
  );
  assert.equal(remaining.length, 0);
  assert.equal(applied, 0);
  assert.equal(duplicates, 1);
});

test('une indisponibilité garde l’opération et compte l’essai', () => {
  const { remaining } = reconcile(
    [op('d'.repeat(26), 'order.advance', {}, 2)],
    [{ opId: 'd'.repeat(26), status: 'retry', error: 'Indisponible.' }],
  );
  assert.equal(remaining.length, 1, 'Une panne d’infrastructure doit pouvoir être retentée');
  assert.equal(remaining[0].attempts, 3);
  assert.equal(remaining[0].lastError, 'Indisponible.');
});

test('une opération sans réponse reste en file : on ne présume rien', () => {
  const { remaining } = reconcile([op('e'.repeat(26), 'order.advance')], []);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].attempts, 0, 'Une absence de réponse n’est pas un essai raté');
});

test('un lot mixte règle chaque opération séparément', () => {
  const pending = [
    op('f'.repeat(26), 'order.create'),
    op('g'.repeat(26), 'order.advance'),
    op('h'.repeat(26), 'order.advance'),
  ];
  const { remaining, applied, rejected } = reconcile(pending, [
    { opId: 'f'.repeat(26), status: 'applied', resultId: '1' },
    { opId: 'g'.repeat(26), status: 'rejected', error: 'Transition impossible.' },
    { opId: 'h'.repeat(26), status: 'retry' },
  ]);
  assert.equal(applied, 1);
  assert.equal(rejected.length, 1);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].opId, 'h'.repeat(26));
});

test('un ticket envoyé hors ligne apparaît envoyé à l’écran', () => {
  const server = [{ _id: '1', orderNumber: 'CMD-A1-00001', status: 'draft' }];
  const view = mergePending(server, [op('i'.repeat(26), 'salle.ticket.send', { orderId: '1' })]);
  assert.equal(view[0].status, 'confirmed');
  assert.equal(view[0].pending, true, 'L’écran doit pouvoir signaler que la reprise n’a pas encore eu lieu');
});

test('une commande prise hors ligne apparaît avant celles du serveur', () => {
  const view = mergePending(
    [{ _id: '1', orderNumber: 'CMD-A1-00001', status: 'ready' }],
    [
      op('j'.repeat(26), 'order.create', {
        orderNumber: 'CMD-A1-00007',
        fulfillmentType: 'takeaway',
        items: [{ name: 'Poulet', qty: 1, price: 4000 }],
      }),
    ],
  );
  assert.equal(view.length, 2);
  assert.equal(view[0].orderNumber, 'CMD-A1-00007');
  assert.equal(view[0].pending, true);
  assert.equal(view[0].status, 'pending');
  assert.equal(view[1].pending, undefined, 'Une commande déjà connue du serveur n’est pas marquée en attente');
});

test('une progression hors ligne se voit immédiatement', () => {
  const view = mergePending(
    [{ _id: '1', orderNumber: 'CMD-A1-00001', status: 'confirmed' }],
    [op('k'.repeat(26), 'order.advance', { orderId: '1', status: 'preparing' })],
  );
  assert.equal(view[0].status, 'preparing');
});

test('une opération visant une commande inconnue n’invente rien', () => {
  const view = mergePending(
    [{ _id: '1', orderNumber: 'CMD-A1-00001', status: 'ready' }],
    [op('l'.repeat(26), 'order.advance', { orderId: 'inconnu', status: 'preparing' })],
  );
  assert.equal(view.length, 1);
  assert.equal(view[0].status, 'ready');
});

test('le numéro est formaté comme le serveur l’attend', () => {
  assert.equal(formatLeasedNumber('A1', 42), 'CMD-A1-00042');
  assert.match(formatLeasedNumber('CAI', 123456), /^CMD-CAI-123456$/);
});

test('l’identifiant d’opération respecte le format accepté par la reprise', () => {
  const id = newOperationId((size) => Uint8Array.from({ length: size }, (_, index) => index));
  assert.match(id, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(id.length, 26);
});

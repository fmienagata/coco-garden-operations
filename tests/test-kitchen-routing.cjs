const { test } = require('node:test');
const assert = require('node:assert/strict');
const { routeItems, renderTicket, printJobId } = require('../src/lib/kitchen-routing.ts');

const station = (id, name, categories, extra = {}) => ({
  id,
  name,
  destination: 'imprimante',
  categories,
  isDefault: false,
  printerWidth: 42,
  ...extra,
});
const cuisine = station('c', 'Cuisine', ['Plats', 'Entrées'], { isDefault: true, categories: [] });
const bar = station('b', 'Bar', ['Boissons']);
const item = (name, category, qty = 1) => ({ name, category, qty, price: 1000 });

const source = {
  orderNumber: 'CMD-S1-00042',
  fulfillmentType: 'dine_in',
  tableNumber: 12,
  covers: 4,
  createdByLabel: 'Salle · ange',
  producedAt: new Date('2026-09-15T20:14:00'),
};

test('chaque poste ne reçoit que ce qui le concerne', () => {
  const routed = routeItems([item('Poulet DG', 'Plats'), item('Primus', 'Boissons', 2)], [cuisine, bar]);
  const byName = Object.fromEntries(routed.map((entry) => [entry.station.name, entry.items.map((line) => line.name)]));
  assert.deepEqual(byName.Cuisine, ['Poulet DG']);
  assert.deepEqual(byName.Bar, ['Primus']);
});

test('une catégorie non adressée tombe sur le poste par défaut plutôt que de disparaître', () => {
  const routed = routeItems([item('Glace coco', 'Desserts')], [cuisine, bar]);
  assert.equal(routed.length, 1);
  assert.equal(routed[0].station.name, 'Cuisine');
});

test('un poste sans ligne ne reçoit pas de bon vide', () => {
  const routed = routeItems([item('Primus', 'Boissons')], [cuisine, bar]);
  assert.equal(routed.length, 1);
  assert.equal(routed[0].station.name, 'Bar');
});

test('sans poste par défaut, une catégorie inconnue n’est routée nulle part', () => {
  const routed = routeItems([item('Glace coco', 'Desserts')], [bar]);
  assert.equal(routed.length, 0);
});

test('les lignes gardent leur ordre de saisie dans le poste', () => {
  const routed = routeItems([item('Entrée', 'Plats'), item('Plat', 'Plats'), item('Dessert', 'Plats')], [cuisine]);
  assert.deepEqual(
    routed[0].items.map((line) => line.name),
    ['Entrée', 'Plat', 'Dessert'],
  );
});

test('le bon annonce le poste, la table et le numéro', () => {
  const lines = renderTicket(source, cuisine, [item('Poulet DG', 'Plats', 2)]);
  const text = lines.map((line) => line.text);
  assert.equal(text[0], 'CUISINE');
  assert.equal(lines[0].style, 'titre');
  assert.ok(text.includes('TABLE 12 · 4 couverts'));
  assert.ok(text.some((line) => line.includes('CMD-S1-00042') && line.includes('20:14')));
  assert.ok(text.includes('2x Poulet DG'));
});

test('aucun prix ne figure sur un bon de préparation', () => {
  const lines = renderTicket(source, cuisine, [item('Poulet DG', 'Plats', 2)]);
  assert.ok(
    !lines.some((line) => /\d{3,}/.test(line.text.replace('CMD-S1-00042', ''))),
    'Un bon de cuisine ne porte pas de montant',
  );
});

test('un nom trop long est replié sans être tronqué', () => {
  const narrow = station('c', 'Cuisine', [], { printerWidth: 20, isDefault: true });
  const long = 'Poulet DG accompagne de plantain frit et sauce tomate maison';
  const lines = renderTicket(source, narrow, [{ name: long, qty: 1, price: 0 }]);
  const body = lines.filter((line) => line.style === 'article').map((line) => line.text);
  assert.ok(body.length > 1, 'Le nom doit passer à la ligne');
  assert.ok(
    body.every((line) => line.length <= 20),
    'Aucune ligne ne doit dépasser la largeur du papier',
  );
  assert.equal(body.join(' ').replace(/\s+/g, ' ').trim(), `1x ${long}`, 'Aucun mot ne doit être perdu');
});

test('les consignes de table sont reportées sur le bon', () => {
  const lines = renderTicket({ ...source, diningNotes: 'allergie arachide' }, cuisine, [item('Poulet DG', 'Plats')]);
  assert.ok(lines.some((line) => line.style === 'note' && line.text.includes('allergie arachide')));
});

test('une commande à emporter ne porte pas de table', () => {
  const lines = renderTicket({ ...source, fulfillmentType: 'takeaway', tableNumber: undefined }, cuisine, [
    item('Poulet DG', 'Plats'),
  ]);
  const text = lines.map((line) => line.text);
  assert.ok(text.includes('A EMPORTER'));
  assert.ok(!text.some((line) => line.startsWith('TABLE')));
});

test('une livraison rappelle l’adresse au poste', () => {
  const lines = renderTicket(
    { ...source, fulfillmentType: 'delivery', deliveryAddress: 'Avenue Moe Vangoula, face a la Direction de la Peche' },
    cuisine,
    [item('Poulet DG', 'Plats')],
  );
  assert.ok(lines.some((line) => line.text.includes('Vangoula')));
});

test('le bon est identifié par commande et par poste, donc jamais imprimé deux fois', () => {
  assert.equal(printJobId('coco-garden', 'abc', 'bar'), 'coco-garden:abc:bar');
  assert.notEqual(printJobId('coco-garden', 'abc', 'bar'), printJobId('coco-garden', 'abc', 'cuisine'));
});

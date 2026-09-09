const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  loadLocalEnv();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI est requis pour les données de test Salle.');

  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  await mongoose.connect(process.env.MONGO_URI);

  const MenuItem = mongoose.connection.collection('menuitems');
  const DiningTable = mongoose.connection.collection('diningtables');
  const Order = mongoose.connection.collection('orders');
  const Settlement = mongoose.connection.collection('settlements');

  const menu = await MenuItem.find({ restaurantId, active: true }).sort({ category: 1, sortOrder: 1 }).limit(20).toArray();
  if (!menu.length) {
    throw new Error('Aucun article actif dans la carte. Chargez d’abord la carte de démonstration.');
  }

  const tableRows = [
    { number: 1, name: 'Terrasse', capacity: 4, active: true },
    { number: 2, name: 'Fenêtre', capacity: 2, active: true },
    { number: 3, name: 'Privée', capacity: 6, active: true },
    { number: 4, name: 'Bar', capacity: 3, active: false },
  ];

  const tableIds = {};
  for (const row of tableRows) {
    const table = await DiningTable.findOneAndUpdate(
      { restaurantId, number: row.number },
      {
        $set: {
          restaurantId,
          number: row.number,
          name: row.name,
          capacity: row.capacity,
          active: row.active,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );
    tableIds[row.number] = table._id;
  }

  const pickItem = (suffix) => {
    const candidate = menu.find((item) => item.name.includes(suffix)) || menu[0];
    const variant = candidate?.variants?.[0];
    return {
      itemCode: candidate.itemCode,
      name: candidate.name + (variant ? ` • ${variant.label}` : ''),
      qty: 1,
      price: variant ? variant.price : candidate.price,
      ...(variant ? { variant: variant.label } : {}),
    };
  };

  const seededOrders = [
    {
      restaurantId,
      orderNumber: 'CMD-SALLE-1001',
      createdBy: 'salle-test',
      createdByType: 'management',
      createdByLabel: 'Salle • test',
      fulfillmentType: 'dine_in',
      diningTableId: String(tableIds[1]),
      tableNumber: 1,
      covers: 2,
      diningNotes: 'Pas trop cuit, service rapide.',
      items: [pickItem('Burger'), pickItem('Jus')],
      total: 0,
      status: 'draft',
      diningClosed: false,
      requestKey: 'salle-draft-1',
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
      updatedAt: new Date(Date.now() - 40 * 60 * 1000),
    },
    {
      restaurantId,
      orderNumber: 'CMD-SALLE-1002',
      createdBy: 'salle-test',
      createdByType: 'management',
      createdByLabel: 'Salle • test',
      fulfillmentType: 'dine_in',
      diningTableId: String(tableIds[2]),
      tableNumber: 2,
      covers: 4,
      diningNotes: 'Commande pour table 2.',
      items: [pickItem('Salade'), pickItem('Poisson'), pickItem('Riz')],
      total: 0,
      status: 'confirmed',
      diningClosed: false,
      requestKey: 'salle-confirmed-2',
      createdAt: new Date(Date.now() - 25 * 60 * 1000),
      updatedAt: new Date(Date.now() - 25 * 60 * 1000),
    },
    {
      restaurantId,
      orderNumber: 'CMD-SALLE-1003',
      createdBy: 'salle-test',
      createdByType: 'management',
      createdByLabel: 'Salle • test',
      fulfillmentType: 'dine_in',
      diningTableId: String(tableIds[1]),
      tableNumber: 1,
      covers: 3,
      diningNotes: 'À servir dès prêt.',
      items: [pickItem('Salade'), pickItem('Poulet'), pickItem('Riz')],
      total: 0,
      status: 'ready',
      diningClosed: false,
      requestKey: 'salle-ready-3',
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    {
      restaurantId,
      orderNumber: 'CMD-SALLE-1004',
      createdBy: 'salle-test',
      createdByType: 'management',
      createdByLabel: 'Salle • test',
      fulfillmentType: 'dine_in',
      diningTableId: String(tableIds[3]),
      tableNumber: 3,
      covers: 2,
      diningNotes: 'Ticket déjà servi, payé.',
      items: [pickItem('Salade'), pickItem('Poulet')],
      total: 0,
      status: 'served',
      servedAt: new Date(Date.now() - 5 * 60 * 1000),
      diningClosed: true,
      requestKey: 'salle-served-4',
      createdAt: new Date(Date.now() - 12 * 60 * 1000),
      updatedAt: new Date(Date.now() - 6 * 60 * 1000),
    },
    {
      restaurantId,
      orderNumber: 'CMD-SALLE-1005',
      createdBy: 'salle-test',
      createdByType: 'management',
      createdByLabel: 'Salle • test',
      fulfillmentType: 'dine_in',
      diningTableId: String(tableIds[2]),
      tableNumber: 2,
      covers: 2,
      diningNotes: 'Annulé avant cuisson.',
      items: [pickItem('Salade')],
      total: 0,
      status: 'cancelled',
      diningClosed: true,
      cancellationReason: 'Client a annulé.',
      requestKey: 'salle-cancelled-5',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 55 * 60 * 1000),
    },
  ];

  for (const order of seededOrders) {
    order.total = order.items.reduce((sum, line) => sum + line.price * line.qty, 0);
  }

  for (const order of seededOrders) {
    const found = await Order.findOne({ restaurantId, requestKey: order.requestKey });
    if (!found) {
      const created = await Order.insertOne(order);
      if (order.status === 'served' && order.diningClosed) {
        await Settlement.updateOne(
          { _id: `${restaurantId}:${String(created.insertedId)}` },
          {
            $setOnInsert: {
              _id: `${restaurantId}:${String(created.insertedId)}`,
              restaurantId,
              orderId: String(created.insertedId),
              amount: order.total,
              method: 'cash',
              paidAt: new Date(),
              paidBy: 'salle-test',
            },
          },
          { upsert: true },
        );
      }
    }
  }

  console.log(`Données de test Salle créées pour ${restaurantId}. Tables: ${tableRows.length}. Commandes: ${seededOrders.length}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());

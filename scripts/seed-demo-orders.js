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

const demoItems = [
  [{ name: 'Salade Coco Garden', qty: 1 }, { name: 'Riz, plantain, frites ou manioc', qty: 1 }],
  [{ name: 'Poisson salé aux aubergines', qty: 2 }, { name: 'Riz, plantain, frites ou manioc', qty: 2 }],
  [{ name: 'Le Plateau Coco Garden', qty: 1 }, { name: 'Salade de fruits de saison', qty: 1 }],
  [{ name: 'Brochette de bœuf', qty: 3 }, { name: 'Riz, plantain, frites ou manioc', qty: 1 }],
  [{ name: 'Poulet aux petits pois', qty: 1 }, { name: 'Salade d’avocat & crevettes', qty: 1 }],
  [{ name: 'Saka-saka aux feuilles de manioc', qty: 1 }, { name: 'Riz, plantain, frites ou manioc', qty: 1 }],
  [{ name: 'Coco Burger', qty: 2 }, { name: 'Jus de fruit frais', qty: 2 }],
  [{ name: 'Bar', qty: 1 }, { name: 'Café expresso', qty: 1 }],
];
const statuses = ['pending', 'pending', 'confirmed', 'confirmed', 'preparing', 'preparing', 'ready', 'ready'];
const deliveryAddresses = [
  '12 avenue de la République, Centre-ville, Pointe-Noire',
  '8 rue Tchikobo, Pointe-Noire',
  '24 avenue de Loandjili, Pointe-Noire',
  '5 rue Tié-Tié, Pointe-Noire',
];

async function main() {
  loadLocalEnv();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  await mongoose.connect(process.env.MONGO_URI);
  const menuCollection = mongoose.connection.collection('menuitems');
  const zoneCollection = mongoose.connection.collection('deliveryzones');
  const zones = await zoneCollection.find({ restaurantId, active: true }).sort({ sortOrder: 1 }).toArray();
  if (!zones.length) throw new Error('At least one active delivery zone is required');
  const menuItems = await menuCollection.find({ restaurantId, active: true }).toArray();
  const menuByName = new Map(menuItems.map((item) => [item.name, item]));
  const normalizedDemoItems = demoItems.map((items) => items.map((item) => {
    const menuItem = menuByName.get(item.name);
    if (!menuItem) throw new Error(`Menu item not found: ${item.name}`);
    return { name: menuItem.name, itemCode: menuItem.itemCode, qty: item.qty, price: menuItem.price };
  }));
  const orders = normalizedDemoItems.map((items, index) => ({
    restaurantId,
    tableNumber: index % 2 === 0 ? null : index + 1,
    createdBy: 'demo-seed',
    createdByType: 'management',
    createdByLabel: 'Données de démonstration',
    ...(index % 2 === 0 ? { fulfillmentType: 'delivery', deliveryZoneId: String(zones[(index / 2) % zones.length]._id), deliveryZoneName: zones[(index / 2) % zones.length].name, deliveryFee: zones[(index / 2) % zones.length].fee } : { fulfillmentType: 'takeaway' }),
    items,
    total: items.reduce((sum, item) => sum + item.price * item.qty, 0) + (index % 2 === 0 ? zones[(index / 2) % zones.length].fee : 0),
    status: statuses[index],
    ...(index % 2 === 0 ? { customerName: `Client ${index + 1}`, customerPhone: `+242 06 000 00 ${String(index + 1).padStart(2, '0')}`, deliveryAddress: deliveryAddresses[index / 2], deliveryNotes: index === 0 ? 'Appeler à l’arrivée' : '', driverPhone: '+242060999999' } : {}),
    isDemo: true,
    createdAt: new Date(Date.now() - (index + 1) * 7 * 60 * 1000),
    updatedAt: new Date(),
  }));
  const collection = mongoose.connection.collection('orders');
  const existing = await collection.countDocuments({ restaurantId, isDemo: true });
  if (existing > 0) {
    const legacyOrders = await collection.find({ restaurantId, isDemo: true }).sort({ createdAt: 1 }).toArray();
    for (const [index, order] of legacyOrders.entries()) {
      const patch = index < normalizedDemoItems.length ? { items: normalizedDemoItems[index], total: normalizedDemoItems[index].reduce((sum, item) => sum + item.price * item.qty, 0) } : {};
      if (!order.orderNumber) patch.orderNumber = `CMD-${String(index + 1).padStart(5, '0')}`;
      if (!order.fulfillmentType) patch.fulfillmentType = index % 2 === 0 ? 'delivery' : 'takeaway';
      if (order.fulfillmentType === 'delivery' || patch.fulfillmentType === 'delivery') patch.tableNumber = null;
      if (order.fulfillmentType === 'delivery' || patch.fulfillmentType === 'delivery') {
        const zone = zones[(index / 2) % zones.length];
        Object.assign(patch, { deliveryZoneId: String(zone._id), deliveryZoneName: zone.name, deliveryFee: zone.fee });
        if (patch.items) patch.total += zone.fee;
      }
      if (order.fulfillmentType === 'delivery' || patch.fulfillmentType === 'delivery') Object.assign(patch, { customerName: `Client ${index + 1}`, customerPhone: `+242 06 000 00 ${String(index + 1).padStart(2, '0')}`, deliveryAddress: deliveryAddresses[index / 2], deliveryNotes: index === 0 ? 'Appeler à l’arrivée' : '', driverPhone: '+242060999999' });
      if (Object.keys(patch).length > 0) await collection.updateOne({ _id: order._id }, { $set: patch });
    }
    await mongoose.connection.collection('ordercounters').updateOne(
      { _id: restaurantId },
      { $max: { sequence: legacyOrders.length } },
      { upsert: true },
    );
    console.log(`Demo data already exists for ${restaurantId}; nothing inserted.`);
    return;
  }
  await collection.insertMany(orders);
  console.log(`Inserted ${orders.length} demo orders for ${restaurantId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());

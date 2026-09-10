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
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI est requis.');
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  await mongoose.connect(process.env.MONGO_URI);
  const orders = mongoose.connection.collection('orders');
  const settlements = mongoose.connection.collection('settlements');
  const candidates = await orders.find({
    restaurantId,
    status: { $in: ['delivered', 'collected', 'served'] },
  }).toArray();
  let migrated = 0;
  for (const order of candidates) {
    const settlement = await settlements.findOne({ restaurantId, orderId: String(order._id) });
    const completedAt = order.completedAt || order.deliveredAt || settlement?.collectedAt || settlement?.paidAt || order.servedAt;
    if (!completedAt) continue;
    const result = await orders.updateOne(
      { _id: order._id, restaurantId, status: order.status },
      { $set: { status: 'completed', completedAt } },
    );
    migrated += result.modifiedCount;
  }
  console.log(`Migration terminée pour ${restaurantId}: ${migrated} commande(s) basculée(s) vers completed.`);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; }).finally(() => mongoose.disconnect());

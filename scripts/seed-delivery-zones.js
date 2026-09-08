const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

function loadLocalEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const zones = [
  ['Centre-ville', 1000],
  ['Tchikobo', 1500],
  ['Loandjili', 2000],
  ['Tié-Tié', 2000],
  ['Mongo-Mpoukou', 2500],
];

async function main() {
  loadLocalEnv();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection('deliveryzones');
  let inserted = 0;
  for (const [sortOrder, [name, fee]] of zones.entries()) {
    const result = await collection.updateOne(
      { restaurantId, name },
      { $setOnInsert: { restaurantId, name, fee, active: true, sortOrder, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount) inserted += 1;
  }
  console.log(`${inserted} zones de livraison ajoutées pour ${restaurantId}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());

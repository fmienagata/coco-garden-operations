const { loadEnvConfig } = require('@next/env');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

async function main() {
  loadEnvConfig(process.cwd());
  const { MONGO_URI, CUISINE_LOGIN, CUISINE_PASSWORD } = process.env;
  if (!MONGO_URI || !CUISINE_LOGIN || !CUISINE_PASSWORD) {
    throw new Error('MONGO_URI, CUISINE_LOGIN et CUISINE_PASSWORD sont requis.');
  }
  await mongoose.connect(MONGO_URI);
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `scrypt:${salt}:${crypto.scryptSync(CUISINE_PASSWORD, salt, 64).toString('hex')}`;
  const result = await mongoose.connection.collection('users').updateOne(
    { restaurantId, login: CUISINE_LOGIN },
    {
      $set: {
        restaurantId,
        login: CUISINE_LOGIN,
        name: 'Administrateur',
        passwordHash,
        role: 'admin',
        authType: 'password',
        active: true,
        deletedAt: null,
        sessionVersion: 0,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log(result.upsertedCount ? 'Administrateur ajouté.' : 'Administrateur restauré et actif.');

  const agent = await mongoose.connection.collection('users').updateOne(
    { restaurantId, login: 'whatsapp-agent' },
    {
      $set: {
        restaurantId,
        login: 'whatsapp-agent',
        name: 'Agent WhatsApp',
        role: 'whatsapp_agent',
        authType: 'api_token',
        active: Boolean(process.env.WHATSAPP_AGENT_TOKEN),
        deletedAt: null,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log(agent.upsertedCount ? 'Agent WhatsApp ajouté.' : 'Agent WhatsApp restauré avec son état actuel.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());

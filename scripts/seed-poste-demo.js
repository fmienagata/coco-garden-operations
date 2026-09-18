/**
 * Jeu de démonstration pour éprouver le poste : trois postes de préparation couvrant les
 * trois destinations, un appareil de caisse, et un code PIN sur un compte serveur.
 *
 * Idempotent : relançable sans créer de doublon. Le jeton d'appareil n'étant lisible qu'une
 * fois, un appareil déjà enrôlé voit son jeton régénéré et réaffiché.
 *
 *   npm.cmd run seed:poste-demo
 */

const { loadEnvConfig } = require('@next/env');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const STATIONS = [
  {
    name: 'Cuisine chaude',
    destination: 'imprimante',
    categories: [],
    isDefault: true,
    printerHost: '127.0.0.1',
    printerPort: 9100,
    printerWidth: 42,
  },
  {
    name: 'Bar',
    destination: 'imprimante',
    categories: ['Petit-déjeuner · Boissons'],
    isDefault: false,
    printerHost: '127.0.0.1',
    printerPort: 9100,
    printerWidth: 42,
  },
  {
    name: 'Desserts',
    destination: 'ecran',
    categories: ['Douceurs · Glaces', 'Douceurs · Fruits frais', 'Douceurs · Dessert du jour'],
    isDefault: false,
    printerHost: '',
    printerPort: 9100,
    printerWidth: 42,
  },
];

async function main() {
  loadEnvConfig(process.cwd());
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) throw new Error('MONGO_URI est requis.');
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const now = new Date();

  for (const station of STATIONS) {
    await db
      .collection('preparationstations')
      .updateOne(
        { restaurantId, name: station.name },
        { $set: { restaurantId, ...station, active: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    const routed = station.categories.length ? station.categories.join(', ') : 'tout le reste';
    console.log(`Poste « ${station.name} » · ${station.destination} · ${routed}`);
  }

  // Le jeton n'est stocké qu'en empreinte : on en émet un neuf pour pouvoir l'afficher.
  const token = `dev_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection('devices').updateOne(
    { restaurantId, numberPrefix: 'CA' },
    {
      $set: {
        restaurantId,
        name: 'Caisse principale',
        kind: 'caisse',
        numberPrefix: 'CA',
        tokenHash,
        active: true,
        deletedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, lastSeenAt: null },
    },
    { upsert: true },
  );

  // Un PIN ne sert qu'à la reprise de poste : le mot de passe reste la voie complète.
  const pin = '4817';
  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = `scrypt:${salt}:${crypto.scryptSync(pin, salt, 64).toString('hex')}`;
  const serveur = await db
    .collection('users')
    .findOne({ restaurantId, role: { $in: ['serveur', 'operations'] }, active: true, deletedAt: null });
  if (serveur) {
    await db
      .collection('users')
      .updateOne(
        { _id: serveur._id },
        { $set: { pinHash, pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: now } },
      );
  }

  console.log('\n--- À reporter dans le test ---');
  console.log('Jeton du poste caisse :');
  console.log(token);
  console.log(`\nReprise par code : ${serveur ? serveur.login : 'aucun compte serveur trouvé'} / ${pin}`);
  console.log('\nLe jeton ci-dessus remplace le précédent : un appareil déjà enrôlé devra être ré-enrôlé.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

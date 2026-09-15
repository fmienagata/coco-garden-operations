import mongoose from 'mongoose';

let connectionPromise: Promise<typeof mongoose> | null = null;

export function connectMongo() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI not set');
  if (!connectionPromise) {
    // Une promesse rejetée ne doit pas rester en cache : sinon un échec transitoire
    // au démarrage condamne l'application jusqu'au prochain redémarrage.
    connectionPromise = mongoose.connect(process.env.MONGO_URI).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

export async function pingMongo() {
  const conn = await connectMongo();
  // use the native db admin ping
  // @ts-ignore - mongoose types do not expose `db.admin()` directly
  const admin = (conn.connection as any).db.admin();
  await admin.ping();
  return true;
}

export { mongoose };

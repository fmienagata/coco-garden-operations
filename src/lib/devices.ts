import crypto from 'node:crypto';
import Device from './models/Device';
import { connectMongo } from './db/mongo';
import { UserError } from './api';

export const DEVICE_HEADER = 'x-device-token';

// Le jeton de poste porte 256 bits d'entropie : une empreinte rapide est le bon choix,
// une KDF lente serait payée à chaque requête sans rien apporter face à une force brute.
export function hashDeviceToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueDeviceToken() {
  const token = `dev_${crypto.randomBytes(32).toString('hex')}`;
  return { token, tokenHash: hashDeviceToken(token) };
}

export function normalizePrefix(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,4}$/.test(value.trim())) {
    throw new UserError('Préfixe de poste : 1 à 4 lettres ou chiffres.');
  }
  return value.trim().toUpperCase();
}

export type DeviceIdentity = { id: string; restaurantId: string; name: string; kind: string; numberPrefix: string };

// Renvoie null quand aucun jeton n'est présent : les postes web actuels restent acceptés
// tant que la flotte n'est pas entièrement enrôlée.
export async function readDevice(request: Request): Promise<DeviceIdentity | null> {
  const token = request.headers.get(DEVICE_HEADER);
  if (!token) return null;
  await connectMongo();
  const device = await Device.findOne({ tokenHash: hashDeviceToken(token), active: true, deletedAt: null })
    .select('restaurantId name kind numberPrefix').lean() as any;
  if (!device) throw new UserError('Poste non reconnu ou désactivé.', 401);
  // Trace de vie utile au support : quel poste a parlé en dernier, et quand.
  Device.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  return { id: String(device._id), restaurantId: device.restaurantId, name: device.name, kind: device.kind, numberPrefix: device.numberPrefix };
}

export async function requireDevice(request: Request): Promise<DeviceIdentity> {
  const device = await readDevice(request);
  if (!device) throw new UserError('Ce poste doit être enrôlé avant utilisation.', 401);
  return device;
}

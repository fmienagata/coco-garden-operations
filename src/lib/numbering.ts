import OrderCounter from './models/OrderCounter';
import NumberLease from './models/NumberLease';
import { connectMongo } from './db/mongo';
import { UserError } from './api';
import type { DeviceIdentity } from './devices';

export const DEFAULT_LEASE_SIZE = 100;
const MAX_LEASE_SIZE = 500;
const LEASE_DAYS = 30;

const LEASED_NUMBER = /^CMD-([A-Z0-9]{1,4})-(\d{5,})$/;

export function formatLeasedNumber(prefix: string, sequence: number) {
  return `CMD-${prefix}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Concède au poste une plage de numéros à consommer hors ligne.
 *
 * La plage vient du même compteur atomique que la numérotation en ligne : deux postes
 * ne peuvent donc jamais recevoir le même numéro, sans qu'ils aient à se coordonner.
 */
export async function allocateLease(restaurantId: string, device: DeviceIdentity, size = DEFAULT_LEASE_SIZE) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_LEASE_SIZE) {
    throw new UserError(`Taille de plage invalide (1 à ${MAX_LEASE_SIZE}).`);
  }
  await connectMongo();
  const counter = await OrderCounter.findOneAndUpdate(
    { _id: restaurantId },
    { $inc: { sequence: size } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as { sequence: number } | null;
  if (!counter) throw new UserError('Attribution de numéros impossible.', 503);

  const end = counter.sequence;
  const start = end - size + 1;
  const expiresAt = new Date(Date.now() + LEASE_DAYS * 24 * 60 * 60 * 1000);
  await NumberLease.create({ restaurantId, deviceId: device.id, prefix: device.numberPrefix, start, end, expiresAt });
  return {
    prefix: device.numberPrefix,
    start,
    end,
    size,
    expiresAt: expiresAt.toISOString(),
    firstNumber: formatLeasedNumber(device.numberPrefix, start),
    lastNumber: formatLeasedNumber(device.numberPrefix, end),
  };
}

/**
 * Vérifie qu'un numéro produit hors ligne appartient bien à une plage détenue par ce poste.
 *
 * Sans ce contrôle, un poste compromis pourrait s'attribuer n'importe quel numéro et
 * écraser la piste d'audit d'un autre poste.
 */
export async function assertNumberIsLeased(restaurantId: string, device: DeviceIdentity, orderNumber: unknown) {
  if (typeof orderNumber !== 'string') throw new UserError('Numéro de commande requis hors ligne.');
  const match = LEASED_NUMBER.exec(orderNumber);
  if (!match) throw new UserError('Format de numéro invalide.');
  const [, prefix, digits] = match;
  if (prefix !== device.numberPrefix) throw new UserError('Ce numéro appartient à un autre poste.');
  const sequence = Number(digits);
  const lease = await NumberLease.exists({ restaurantId, deviceId: device.id, start: { $lte: sequence }, end: { $gte: sequence } });
  if (!lease) throw new UserError('Ce numéro ne fait partie d’aucune plage attribuée à ce poste.');
  return orderNumber;
}

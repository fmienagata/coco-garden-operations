'use client';

import { readState, writeState, readQueue, addToQueue, replaceQueue, storageAvailable } from './db';
import {
  takeNumber,
  needsLease,
  remainingNumbers,
  reconcile,
  newOperationId,
  type Lease,
  type PendingOperation,
  type SyncResult,
} from './core';

const DEVICE_KEY = 'deviceToken';
const LEASES_KEY = 'leases';
const LAST_SYNC_KEY = 'lastSync';

export const DEVICE_HEADER = 'x-device-token';

export type QueueSnapshot = {
  ready: boolean;
  enrolled: boolean;
  pending: PendingOperation[];
  numbersLeft: number;
  lastSync: string | null;
  lastRejections: { opId: string; error: string }[];
};

let snapshot: QueueSnapshot = {
  ready: false,
  enrolled: false,
  pending: [],
  numbersLeft: 0,
  lastSync: null,
  lastRejections: [],
};
const listeners = new Set<() => void>();
let flushing: Promise<void> | null = null;

export function getSnapshot() {
  return snapshot;
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(patch: Partial<QueueSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

async function refresh() {
  const [pending, leases, lastSync, token] = await Promise.all([
    readQueue<PendingOperation>(),
    readState<Lease[]>(LEASES_KEY, []),
    readState<string | null>(LAST_SYNC_KEY, null),
    readState<string | null>(DEVICE_KEY, null),
  ]);
  publish({ ready: true, enrolled: Boolean(token), pending, numbersLeft: remainingNumbers(leases), lastSync });
}

export async function start() {
  if (!storageAvailable()) {
    publish({ ready: true });
    return;
  }
  await refresh();
  await flush();
}

// --- Enrôlement du poste -----------------------------------------------------------------

export async function enrol(token: string) {
  const clean = token.trim();
  if (!/^dev_[0-9a-f]{64}$/.test(clean)) throw new Error('Jeton de poste invalide.');
  const response = await fetch('/api/number-leases', { headers: { [DEVICE_HEADER]: clean }, cache: 'no-store' });
  if (!response.ok) throw new Error('Ce jeton n’est pas reconnu par le serveur.');
  await writeState(DEVICE_KEY, clean);
  await refresh();
  await ensureLeases();
  return (await response.json()).device;
}

export async function forget() {
  await writeState(DEVICE_KEY, null);
  await writeState(LEASES_KEY, []);
  await refresh();
}

async function deviceHeaders(): Promise<Record<string, string> | null> {
  const token = await readState<string | null>(DEVICE_KEY, null);
  return token ? { [DEVICE_HEADER]: token, 'Content-Type': 'application/json' } : null;
}

/** Identité du poste vue par le serveur. Null hors ligne ou si le jeton n'est plus reconnu. */
export async function fetchDevice() {
  const headers = await deviceHeaders();
  if (!headers) return null;
  try {
    const response = await fetch('/api/number-leases', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()).device as { name: string; kind: string; numberPrefix: string };
  } catch {
    return null;
  }
}

// --- Réserve de numéros ------------------------------------------------------------------

/**
 * Reconstitue la réserve tant que le réseau est là.
 *
 * Appelée à chaque reprise réussie : un poste qui travaille normalement ne doit jamais
 * découvrir sa réserve vide au moment où le réseau tombe.
 */
export async function ensureLeases(threshold = 20) {
  const headers = await deviceHeaders();
  if (!headers) return;
  const leases = await readState<Lease[]>(LEASES_KEY, []);
  if (!needsLease(leases, threshold)) return;
  try {
    const response = await fetch('/api/number-leases', {
      method: 'POST',
      headers,
      body: JSON.stringify({ size: 100 }),
    });
    if (!response.ok) return;
    const lease = await response.json();
    const kept = leases.filter((item) => item.next <= item.end);
    await writeState(LEASES_KEY, [
      ...kept,
      { prefix: lease.prefix, start: lease.start, end: lease.end, next: lease.start },
    ]);
    await refresh();
  } catch {
    /* Hors ligne : la réserve actuelle doit suffire jusqu'au retour du réseau. */
  }
}

// --- File d'opérations -------------------------------------------------------------------

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Vrai lorsque le geste demandé a besoin d'un numéro pris dans la réserve du poste. */
function needsNumber(type: string) {
  return type === 'order.create' || type === 'salle.ticket.create';
}

/**
 * Enregistre un geste métier et tente aussitôt de le remonter.
 *
 * Le numéro est réservé et le curseur écrit **avant** que l'opération soit mise en file :
 * si le poste s'éteint entre les deux, un numéro est perdu, ce qui est sans conséquence,
 * là où un numéro attribué deux fois créerait deux commandes sous la même référence.
 */
export async function enqueue(type: string, payload: Record<string, any>) {
  if (!storageAvailable()) throw new Error('Ce navigateur ne permet pas le travail hors ligne.');
  const operation: PendingOperation = {
    opId: newOperationId(randomBytes),
    type,
    payload: { ...payload },
    producedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (needsNumber(type)) {
    const leases = await readState<Lease[]>(LEASES_KEY, []);
    const taken = takeNumber(leases);
    if (!taken) throw new Error('Plus de numéros disponibles. Reconnectez le poste pour en obtenir.');
    await writeState(LEASES_KEY, taken.leases);
    operation.payload.orderNumber = taken.number;
  }

  await addToQueue(operation);
  await refresh();
  flush();
  return operation;
}

/**
 * Remonte la file au serveur.
 *
 * Un seul envoi à la fois : deux reprises simultanées rejoueraient les mêmes opérations et
 * se disputeraient l'écriture de la file. Le serveur les dédoublonnerait, mais la file locale
 * finirait dans un état incohérent.
 */
export async function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const headers = await deviceHeaders();
      if (!headers) return;
      const pending = await readQueue<PendingOperation>();
      if (pending.length === 0) {
        await ensureLeases();
        return;
      }

      const batch = pending
        .slice(0, 200)
        .map(({ opId, type, payload, producedAt }) => ({ opId, type, payload, producedAt }));
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ operations: batch }),
      });
      if (!response.ok) return;

      const { results } = (await response.json()) as { results: SyncResult[] };
      const outcome = reconcile(pending, results);
      await replaceQueue(outcome.remaining);
      await writeState(LAST_SYNC_KEY, new Date().toISOString());
      publish({
        lastRejections: outcome.rejected.map((item) => ({
          opId: item.operation.opId,
          error: item.result.error || 'Refusé.',
        })),
      });
      await refresh();
      await ensureLeases();
    } catch {
      // Hors ligne : la file reste intacte et sera reprise au prochain passage.
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

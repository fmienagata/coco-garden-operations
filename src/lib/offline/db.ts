/**
 * Adaptateur IndexedDB, volontairement minuscule.
 *
 * IndexedDB plutôt que localStorage : la file doit survivre à une fermeture brutale du
 * navigateur et peut contenir des tickets entiers, ce que le quota de localStorage ne
 * garantit pas. Aucune dépendance externe — un poste Android d'entrée de gamme n'a pas
 * à télécharger une bibliothèque pour ouvrir une base locale.
 */

const DB_NAME = 'coco-garden-offline';
const VERSION = 1;
export const QUEUE = 'queue';
export const STATE = 'state';

let connection: Promise<IDBDatabase> | null = null;

export function storageAvailable() {
  return typeof indexedDB !== 'undefined';
}

function open(): Promise<IDBDatabase> {
  if (!storageAvailable()) return Promise.reject(new Error('IndexedDB indisponible'));
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'opId' });
        if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      // Une promesse rejetée ne reste pas en cache : un échec transitoire ne doit pas
      // condamner la base locale jusqu'au rechargement de la page.
      request.onerror = () => { connection = null; reject(request.error); };
    });
  }
  return connection;
}

function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = work(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function readState<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await run<{ key: string; value: T } | undefined>(STATE, 'readonly', (store) => store.get(key));
    return row ? row.value : fallback;
  } catch { return fallback; }
}

export async function writeState<T>(key: string, value: T): Promise<void> {
  await run(STATE, 'readwrite', (store) => store.put({ key, value }));
}

export async function readQueue<T>(): Promise<T[]> {
  try {
    return await run<T[]>(QUEUE, 'readonly', (store) => store.getAll());
  } catch { return []; }
}

export async function addToQueue<T extends { opId: string }>(operation: T): Promise<void> {
  await run(QUEUE, 'readwrite', (store) => store.put(operation));
}

/** Remplace la file par ce qui reste après une reprise, en une seule transaction. */
export async function replaceQueue<T extends { opId: string }>(operations: T[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(QUEUE, 'readwrite');
    const store = transaction.objectStore(QUEUE);
    store.clear();
    for (const operation of operations) store.put(operation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

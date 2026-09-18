'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, type QueueSnapshot } from './client';

// Référence stable : le rendu serveur n'a ni IndexedDB ni file, et une nouvelle valeur
// à chaque appel ferait boucler useSyncExternalStore.
const SERVER: QueueSnapshot = {
  ready: false,
  enrolled: false,
  pending: [],
  numbersLeft: 0,
  lastSync: null,
  lastRejections: [],
};

export function useQueue() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useOffline } from 'next/offline';
import { useQueue } from '../lib/offline/useQueue';
import { start, flush } from '../lib/offline/client';

/**
 * Bandeau d'état du poste, présent sur tous les écrans.
 *
 * L'état de connexion vient de `useOffline` plutôt que de `navigator.onLine` : le hook
 * sonde réellement le serveur, il détecte donc le cas courant d'un appareil accroché au
 * WiFi du restaurant alors que la liaison Internet est tombée.
 */
export default function OfflineRuntime() {
  const offline = useOffline();
  const queue = useQueue();

  useEffect(() => {
    start();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sans service worker, le travail hors ligne reste possible ; seul un
        // rechargement complet pendant une coupure échouera.
      });
    }
  }, []);

  // Le retour du réseau doit vider la file sans que personne ait à y penser.
  useEffect(() => {
    if (!offline) flush();
  }, [offline]);

  const waiting = queue.pending.length;
  if (!offline && waiting === 0 && queue.numbersLeft > 0) return null;
  if (!queue.ready && !offline) return null;

  const tone = offline ? 'offline' : waiting > 0 ? 'syncing' : 'warn';
  const message = offline
    ? `Hors ligne — le travail continue${waiting > 0 ? `, ${waiting} opération${waiting > 1 ? 's' : ''} en attente` : ''}.`
    : waiting > 0
      ? `Reprise en cours — ${waiting} opération${waiting > 1 ? 's' : ''} à remonter.`
      : 'Réserve de numéros épuisée : ce poste ne peut plus prendre de commande hors ligne.';

  return (
    <div className={`offline-bar offline-bar--${tone}`} role="status" aria-live="polite">
      <span className="offline-bar__dot" aria-hidden="true" />
      <span>{message}</span>
      {queue.enrolled && queue.numbersLeft > 0 && (
        <span className="offline-bar__meta">{queue.numbersLeft} numéros en réserve</span>
      )}
      <Link href="/poste" className="offline-bar__link">
        Poste
      </Link>
    </div>
  );
}

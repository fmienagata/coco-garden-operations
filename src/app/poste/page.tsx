'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useOffline } from 'next/offline';
import ModulePageHeader from '../../components/ModulePageHeader';
import { useQueue } from '../../lib/offline/useQueue';
import { enrol, forget, flush, ensureLeases, start, fetchDevice } from '../../lib/offline/client';

const LABELS: Record<string, string> = {
  'order.create': 'Prise de commande',
  'order.advance': 'Progression en cuisine',
  'salle.ticket.create': 'Ouverture de ticket',
  'salle.ticket.send': 'Envoi en cuisine',
  'salle.ticket.serve': 'Service confirmé',
};

function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'jamais';
}

export default function PostePage() {
  const offline = useOffline();
  const queue = useQueue();
  const [token, setToken] = useState('');
  const [device, setDevice] = useState<{ name: string; kind: string; numberPrefix: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { start(); }, []);

  // Le poste connaît son nom dès qu'il est joignable ; hors ligne, il reste identifié
  // par son préfixe, qui suffit à lire les numéros déjà émis.
  useEffect(() => {
    if (!queue.enrolled || offline) return;
    fetchDevice().then((found) => { if (found) setDevice(found); });
  }, [queue.enrolled, offline]);

  async function handleEnrol(event: FormEvent) {
    event.preventDefault();
    setError(''); setBusy(true);
    try { setDevice(await enrol(token)); setToken(''); }
    catch (issue: any) { setError(issue.message || 'Enrôlement impossible.'); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  if (!queue.enrolled) {
    return (
      <main className="poste-shell">
        <ModulePageHeader title="Poste" description="Enrôlement de cet appareil" />
        <p className="muted">
          Un administrateur crée le poste depuis l’API puis vous remet son jeton. Il n’est
          affiché qu’une seule fois : après enrôlement, cet appareil peut prendre des commandes
          même sans réseau.
        </p>
        <form className="auth-form" onSubmit={handleEnrol}>
          <label htmlFor="poste-token">
            Jeton du poste
            <input id="poste-token" value={token} onChange={(event) => setToken(event.target.value)} placeholder="dev_…" autoComplete="off" required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button disabled={busy || offline}>{offline ? 'Connexion requise pour enrôler' : 'Enrôler ce poste'}</button>
        </form>
      </main>
    );
  }

  const exhausted = queue.numbersLeft === 0;

  return (
    <main className="poste-shell">
      <ModulePageHeader
        title={device ? device.name : 'Poste enrôlé'}
        description={offline ? 'Hors ligne — le travail continue localement' : 'Connecté au serveur'}
      />

      <div className="poste-grid">
        <div className={`poste-tile${exhausted ? ' poste-tile--alert' : ''}`}>
          <span>Réserve de numéros</span>
          <strong>{queue.numbersLeft}</strong>
          <small>{exhausted ? 'Reconnectez le poste pour en obtenir' : 'commandes possibles sans réseau'}</small>
        </div>
        <div className={`poste-tile${queue.pending.length > 0 ? ' poste-tile--alert' : ''}`}>
          <span>En attente de reprise</span>
          <strong>{queue.pending.length}</strong>
          <small>{queue.pending.length === 0 ? 'Tout est remonté' : 'opérations encore locales'}</small>
        </div>
        <div className="poste-tile">
          <span>Dernière reprise</span>
          <strong>{time(queue.lastSync)}</strong>
          <small>{device ? `Préfixe ${device.numberPrefix}` : 'Préfixe inconnu hors ligne'}</small>
        </div>
      </div>

      <div className="poste-actions">
        <button className="secondary-button" disabled={busy || offline} onClick={() => run(flush)}>Reprendre maintenant</button>
        <button className="secondary-button" disabled={busy || offline} onClick={() => run(() => ensureLeases(Number.MAX_SAFE_INTEGER))}>Compléter la réserve</button>
        <button className="danger-button" disabled={busy || queue.pending.length > 0} onClick={() => run(forget)}>
          {queue.pending.length > 0 ? 'Reprise en attente — retrait bloqué' : 'Retirer ce poste'}
        </button>
      </div>

      {queue.lastRejections.length > 0 && (
        <section className="poste-section">
          <h2>Opérations refusées</h2>
          <p className="muted">
            Ces gestes ont été produits sur ce poste mais le serveur les a refusés — le plus souvent
            parce que la commande avait déjà été traitée ailleurs pendant la coupure. Ils ne seront
            pas réessayés : vérifiez chaque cas en salle.
          </p>
          <ul className="poste-list poste-list--rejected">
            {queue.lastRejections.map((rejection) => (
              <li key={rejection.opId}>
                <code>{rejection.opId.slice(0, 8)}</code>
                <span className="poste-rejected-reason">{rejection.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="poste-section">
        <h2>File locale</h2>
        {queue.pending.length === 0
          ? <p className="poste-empty">Rien en attente. Tout ce qui a été fait sur ce poste est enregistré au serveur.</p>
          : (
            <ul className="poste-list">
              {queue.pending.map((operation) => (
                <li key={operation.opId}>
                  <span>{LABELS[operation.type] || operation.type}</span>
                  <code>{operation.payload.orderNumber || operation.payload.orderId || '—'}</code>
                  <span className="offline-bar__meta">{time(operation.producedAt)}{operation.attempts > 0 ? ` · ${operation.attempts} essai${operation.attempts > 1 ? 's' : ''}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}

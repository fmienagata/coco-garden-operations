'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ModulePageHeader from '../../components/ModulePageHeader';

type Station = {
  _id: string;
  name: string;
  destination: 'ecran' | 'imprimante' | 'les_deux';
  categories: string[];
  isDefault: boolean;
  printerHost: string;
  printerPort: number;
  printerWidth: number;
  active: boolean;
};
type Device = { _id: string; name: string; kind: string; numberPrefix: string; active: boolean; lastSeenAt?: string };

const DESTINATIONS: Record<Station['destination'], string> = {
  ecran: 'Écran seulement',
  imprimante: 'Imprimante seulement',
  les_deux: 'Écran et imprimante',
};
const KINDS: Record<string, string> = { caisse: 'Caisse', salle: 'Salle', cuisine: 'Cuisine' };

const emptyStation = {
  name: '',
  destination: 'ecran' as Station['destination'],
  categories: '',
  isDefault: false,
  printerHost: '',
  printerPort: '9100',
  printerWidth: '42',
};
const emptyDevice = { name: '', kind: 'salle', numberPrefix: '' };

function seen(value?: string) {
  if (!value) return 'jamais vu';
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 60 * 24) return `il y a ${Math.round(minutes / 60)} h`;
  return new Date(value).toLocaleDateString('fr-FR');
}

export default function ConfigurationPage() {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [station, setStation] = useState(emptyStation);
  const [editing, setEditing] = useState<string | null>(null);
  const [device, setDevice] = useState(emptyDevice);
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [stationsResponse, devicesResponse, menuResponse] = await Promise.all([
      fetch('/api/stations', { cache: 'no-store' }),
      fetch('/api/devices', { cache: 'no-store' }),
      fetch('/api/menu', { cache: 'no-store' }),
    ]);
    if (stationsResponse.status === 401 || devicesResponse.status === 401) {
      router.replace('/login');
      return;
    }
    // La liste des postes est lisible par la cuisine ; c'est l'accès aux appareils
    // qui distingue réellement l'administrateur.
    if (devicesResponse.status === 403) {
      setError('Cette page est réservée à l’administrateur.');
      setLoading(false);
      return;
    }
    if (stationsResponse.ok) setStations(await stationsResponse.json());
    if (devicesResponse.ok) setDevices(await devicesResponse.json());
    if (menuResponse.ok) {
      const menu = await menuResponse.json();
      setCategories([...new Set(menu.map((item: any) => item.category))].sort() as string[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function send(path: string, method: string, body?: unknown) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 204) return {};
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Opération impossible.');
        return null;
      }
      return data;
    } catch {
      setError('Serveur injoignable. Réessayez.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveStation(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      name: station.name,
      destination: station.destination,
      categories: station.categories
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      isDefault: station.isDefault,
      printerHost: station.printerHost,
      printerPort: Number(station.printerPort) || 9100,
      printerWidth: Number(station.printerWidth) || 42,
    };
    const result = editing
      ? await send(`/api/stations/${editing}`, 'PATCH', payload)
      : await send('/api/stations', 'POST', payload);
    if (!result) return;
    setStation(emptyStation);
    setEditing(null);
    setMessage(editing ? 'Poste mis à jour.' : 'Poste créé.');
    await load();
  }

  function editStation(entry: Station) {
    setEditing(entry._id);
    setStation({
      name: entry.name,
      destination: entry.destination,
      categories: (entry.categories || []).join(', '),
      isDefault: entry.isDefault,
      printerHost: entry.printerHost || '',
      printerPort: String(entry.printerPort || 9100),
      printerWidth: String(entry.printerWidth || 42),
    });
  }

  async function removeStation(entry: Station) {
    if (!window.confirm(`Supprimer le poste « ${entry.name} » ? Ses lignes iront au poste par défaut.`)) return;
    if ((await send(`/api/stations/${entry._id}`, 'DELETE')) === null) return;
    setMessage('Poste supprimé.');
    await load();
  }

  async function enrolDevice(event: FormEvent) {
    event.preventDefault();
    const result = await send('/api/devices', 'POST', { ...device, numberPrefix: device.numberPrefix });
    if (!result) return;
    // Le jeton n'est lisible qu'ici : la base n'en garde qu'une empreinte.
    setToken({ name: result.name, value: result.token });
    setDevice(emptyDevice);
    await load();
  }

  async function rotate(entry: Device) {
    if (!window.confirm(`Révoquer le jeton de « ${entry.name} » ? L’appareil devra être ré-enrôlé.`)) return;
    const result = await send(`/api/devices/${entry._id}`, 'PATCH', { rotateToken: true });
    if (!result) return;
    setToken({ name: entry.name, value: result.token });
    await load();
  }

  async function removeDevice(entry: Device) {
    if (!window.confirm(`Retirer « ${entry.name} » ? Il cessera immédiatement de fonctionner.`)) return;
    if ((await send(`/api/devices/${entry._id}`, 'DELETE')) === null) return;
    setMessage('Appareil retiré.');
    await load();
  }

  const printing = station.destination !== 'ecran';

  return (
    <main id="module-content" tabIndex={-1} className="config-shell">
      <ModulePageHeader title="Configuration" description="Postes de préparation et appareils enrôlés." />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="config-notice" role="status">
          {message}
        </p>
      )}

      {token && (
        <section className="config-token" role="status">
          <h2>Jeton de « {token.name} »</h2>
          <p className="muted">
            Notez-le maintenant : il n’est affiché qu’une seule fois. Saisissez-le sur l’appareil, page{' '}
            <strong>Poste</strong>, pour l’enrôler.
          </p>
          <code className="config-token__value">{token.value}</code>
          <div className="poste-actions">
            <button
              className="secondary-button"
              onClick={() =>
                navigator.clipboard?.writeText(token.value).then(
                  () => setMessage('Jeton copié.'),
                  () => undefined,
                )
              }
            >
              Copier
            </button>
            <button className="secondary-button" onClick={() => setToken(null)}>
              J’ai noté le jeton
            </button>
          </div>
        </section>
      )}

      <section className="poste-section">
        <h2>Postes de préparation</h2>
        <p className="muted">
          Chaque poste reçoit les catégories de la carte qui le concernent, sur écran, sur imprimante, ou les deux. Le
          poste par défaut récupère tout ce qui n’est adressé nulle part.
        </p>

        {loading ? (
          <p className="poste-empty">Chargement…</p>
        ) : stations.length === 0 ? (
          <p className="poste-empty">Aucun poste. Créez-en un ci-dessous : sans poste, rien ne part en cuisine.</p>
        ) : (
          <ul className="config-list">
            {stations.map((entry) => (
              <li key={entry._id} className={entry.active ? '' : 'config-list__inactive'}>
                <div>
                  <strong>
                    {entry.name}
                    {entry.isDefault && <span className="config-tag">par défaut</span>}
                  </strong>
                  <small>
                    {DESTINATIONS[entry.destination]}
                    {entry.printerHost
                      ? ` · ${entry.printerHost}:${entry.printerPort} · ${entry.printerWidth} car.`
                      : ''}
                  </small>
                  <small>
                    {entry.categories?.length ? entry.categories.join(', ') : 'toutes les catégories non adressées'}
                  </small>
                </div>
                <div className="config-row-actions">
                  <button className="secondary-button" disabled={busy} onClick={() => editStation(entry)}>
                    Modifier
                  </button>
                  <button className="danger-button" disabled={busy} onClick={() => removeStation(entry)}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="config-form" onSubmit={saveStation}>
          <h3>{editing ? 'Modifier le poste' : 'Nouveau poste'}</h3>
          <div className="config-fields">
            <label htmlFor="station-name">
              Nom
              <input
                id="station-name"
                value={station.name}
                onChange={(event) => setStation({ ...station, name: event.target.value })}
                placeholder="Bar, Cuisine chaude…"
                required
              />
            </label>
            <label htmlFor="station-destination">
              Destination
              <select
                id="station-destination"
                value={station.destination}
                onChange={(event) =>
                  setStation({ ...station, destination: event.target.value as Station['destination'] })
                }
              >
                {Object.entries(DESTINATIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="station-categories">
              Catégories servies
              <input
                id="station-categories"
                value={station.categories}
                onChange={(event) => setStation({ ...station, categories: event.target.value })}
                placeholder={categories.slice(0, 2).join(', ') || 'Boissons, Plats'}
                list="config-categories"
              />
              <datalist id="config-categories">
                {categories.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
            {printing && (
              <>
                <label htmlFor="station-host">
                  Imprimante (adresse réseau)
                  <input
                    id="station-host"
                    value={station.printerHost}
                    onChange={(event) => setStation({ ...station, printerHost: event.target.value })}
                    placeholder="192.168.1.50"
                    required
                  />
                </label>
                <label htmlFor="station-port">
                  Port
                  <input
                    id="station-port"
                    type="number"
                    min="1"
                    max="65535"
                    value={station.printerPort}
                    onChange={(event) => setStation({ ...station, printerPort: event.target.value })}
                  />
                </label>
                <label htmlFor="station-width">
                  Largeur du papier
                  <select
                    id="station-width"
                    value={station.printerWidth}
                    onChange={(event) => setStation({ ...station, printerWidth: event.target.value })}
                  >
                    <option value="42">80 mm — 42 caractères</option>
                    <option value="32">58 mm — 32 caractères</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <label className="config-check" htmlFor="station-default">
            <input
              id="station-default"
              type="checkbox"
              checked={station.isDefault}
              onChange={(event) => setStation({ ...station, isDefault: event.target.checked })}
            />
            Poste par défaut — reçoit les catégories non adressées
          </label>
          <div className="poste-actions">
            <button disabled={busy}>{editing ? 'Enregistrer' : 'Créer le poste'}</button>
            {editing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(null);
                  setStation(emptyStation);
                }}
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="poste-section">
        <h2>Appareils enrôlés</h2>
        <p className="muted">
          Un appareil enrôlé peut travailler hors ligne : il détient une réserve de numéros et rejoue ses gestes au
          retour du réseau. Son préfixe distingue ses numéros de ceux des autres.
        </p>

        {devices.length === 0 ? (
          <p className="poste-empty">Aucun appareil enrôlé.</p>
        ) : (
          <ul className="config-list">
            {devices.map((entry) => (
              <li key={entry._id} className={entry.active ? '' : 'config-list__inactive'}>
                <div>
                  <strong>
                    {entry.name}
                    <span className="config-tag">{entry.numberPrefix}</span>
                  </strong>
                  <small>
                    {KINDS[entry.kind] || entry.kind} · {seen(entry.lastSeenAt)}
                  </small>
                </div>
                <div className="config-row-actions">
                  <button className="secondary-button" disabled={busy} onClick={() => rotate(entry)}>
                    Révoquer le jeton
                  </button>
                  <button className="danger-button" disabled={busy} onClick={() => removeDevice(entry)}>
                    Retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="config-form" onSubmit={enrolDevice}>
          <h3>Enrôler un appareil</h3>
          <div className="config-fields">
            <label htmlFor="device-name">
              Nom
              <input
                id="device-name"
                value={device.name}
                onChange={(event) => setDevice({ ...device, name: event.target.value })}
                placeholder="Tablette salle 1"
                required
              />
            </label>
            <label htmlFor="device-kind">
              Type
              <select
                id="device-kind"
                value={device.kind}
                onChange={(event) => setDevice({ ...device, kind: event.target.value })}
              >
                {Object.entries(KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="device-prefix">
              Préfixe de numérotation
              <input
                id="device-prefix"
                value={device.numberPrefix}
                onChange={(event) => setDevice({ ...device, numberPrefix: event.target.value.toUpperCase() })}
                placeholder="S1"
                maxLength={4}
                required
              />
            </label>
          </div>
          <div className="poste-actions">
            <button disabled={busy}>Enrôler</button>
          </div>
        </form>
      </section>
    </main>
  );
}

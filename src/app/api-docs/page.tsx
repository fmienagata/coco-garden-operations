'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RESTAURANT_NAME } from '../../lib/restaurant';

type Endpoint = { method: string; path: string; title: string; description: string; domain: string; auth: string; testable?: boolean; query?: string; body?: string; parameters?: string[] };

type Result = { status: number; body: string };

const endpoints: Endpoint[] = [
  { method: 'GET', path: '/api/health', title: 'Santé du service', description: 'Vérifie que l’application et sa base sont disponibles.', domain: 'Système', auth: 'Public', testable: true },
  { method: 'POST', path: '/api/auth/login', title: 'Connexion équipe', description: 'Ouvre une session pour un membre du management.', domain: 'Authentification', auth: 'Public', body: '{\n  "login": "cuisine-test",\n  "password": "********"\n}' },
  { method: 'GET', path: '/api/auth/session', title: 'Session courante', description: 'Retourne l’état de la session actuelle.', domain: 'Authentification', auth: 'Session', testable: true },
  { method: 'GET', path: '/api/orders', title: 'Lister les commandes', description: 'Retourne les commandes isolées pour le restaurant connecté.', domain: 'Commandes', auth: 'Session', testable: true },
  { method: 'POST', path: '/api/orders', title: 'Créer une commande', description: 'Crée une commande depuis un plat disponible de la carte.', domain: 'Commandes', auth: 'Session', body: '{\n  "fulfillmentType": "takeaway",\n  "tableNumber": 9,\n  "items": [{ "itemCode": "PLT-00001", "qty": 1 }]\n}' },
  { method: 'POST', path: '/api/orders/update', title: 'Changer le statut cuisine', description: 'Fait progresser une commande dans le workflow de préparation.', domain: 'Commandes', auth: 'Session', body: '{ "id": "<orderId>", "patch": { "status": "confirmed" } }' },
  { method: 'GET', path: '/api/menu', title: 'Lire la carte', description: 'Retourne les plats, codes, prix et disponibilités.', domain: 'Carte', auth: 'Session', testable: true },
  { method: 'POST', path: '/api/menu', title: 'Ajouter un plat', description: 'Ajoute un élément avec code unique et prix en FCFA.', domain: 'Carte', auth: 'Session', body: '{ "category": "Entrées", "name": "Nouveau plat", "price": 3000 }' },
  { method: 'GET', path: '/api/drivers', title: 'Lister les livreurs', description: 'Retourne les livreurs inscrits par le management.', domain: 'Livraison', auth: 'Session', testable: true },
  { method: 'POST', path: '/api/delivery/[id]', title: 'Faire progresser une livraison', description: 'Affecte un livreur, enregistre le départ ou confirme la remise.', domain: 'Livraison', auth: 'Session', parameters: ['id : identifiant de la commande'], body: '{ "action": "pickup" }' },
  { method: 'GET', path: '/api/notifications', title: 'Historique notifications', description: 'Retourne les messages WhatsApp et leur statut.', domain: 'Notifications', auth: 'Session', testable: true },
  { method: 'GET', path: '/api/pilotage', title: 'Rapport de pilotage', description: 'Retourne indicateurs, ventes, encaissements et historique.', domain: 'Pilotage', auth: 'Session', testable: true, query: '?from=YYYY-MM-DD&to=YYYY-MM-DD' },
  { method: 'POST', path: '/api/pilotage/actions', title: 'Déclarer une opération', description: 'Enregistre un encaissement, remboursement ou retrait confirmé.', domain: 'Pilotage', auth: 'Session', body: '{ "orderId": "<orderId>", "action": "pay", "method": "cash", "confirmed": true }' },
];

const domains = ['Tous', ...new Set(endpoints.map((endpoint) => endpoint.domain))];

export default function ApiDocsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('Tous');
  const [results, setResults] = useState<Record<string, Result>>({});
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tryIt, setTryIt] = useState<Record<string, boolean>>({});
  const [requestBodies, setRequestBodies] = useState<Record<string, string>>({});
  const filtered = useMemo(() => endpoints.filter((endpoint) => (domain === 'Tous' || endpoint.domain === domain) && `${endpoint.method} ${endpoint.path} ${endpoint.title} ${endpoint.description}`.toLocaleLowerCase('fr-FR').includes(query.toLocaleLowerCase('fr-FR'))), [domain, query]);

  async function testEndpoint(endpoint: Endpoint) {
    if (!endpoint.testable || endpoint.path.includes('[id]')) return;
    const key = endpoint.method + endpoint.path;
    setLoading(key);
    try {
      const response = await fetch(endpoint.path + (endpoint.query || ''), { method: endpoint.method, cache: 'no-store', headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: endpoint.method === 'POST' ? requestBodies[key] : undefined });
      const text = await response.text();
      setResults((current) => ({ ...current, [key]: { status: response.status, body: text.slice(0, 1200) } }));
    } catch (error) { setResults((current) => ({ ...current, [key]: { status: 0, body: error instanceof Error ? error.message : 'Erreur réseau' } })); }
    finally { setLoading(''); }
  }

  async function copyEndpoint(endpoint: Endpoint) {
    const key = endpoint.method + endpoint.path;
    const body = endpoint.method === 'POST' ? ` -H "Content-Type: application/json" -d '${requestBodies[key] || endpoint.body || '{}'}'` : '';
    await navigator.clipboard.writeText(`curl -i${body} ${window.location.origin}${endpoint.path}${endpoint.query || ''}`);
    setCopied(endpoint.path); window.setTimeout(() => setCopied(''), 1600);
  }

  return <main className="api-shell">
    <header className="api-header"><div><p className="eyebrow">{RESTAURANT_NAME} · DÉVELOPPEMENT</p><h1>API Explorer</h1><p className="muted">Visualisez les routes utilisées par Cuisine, Livraison, Notifications et Pilotage.</p></div><div className="api-header-actions"><button className="secondary-button" onClick={() => router.push('/cuisine')}>Retour cuisine</button></div></header>
    <section className="api-toolbar"><label>Rechercher<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Endpoint, domaine, usage…" /></label><label>Domaine<select value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map((item) => <option key={item}>{item}</option>)}</select></label><strong>{filtered.length} endpoint{filtered.length > 1 ? 's' : ''}</strong></section>
    <section className="api-list">{domains.filter((item) => item !== 'Tous').map((tag) => { const tagEndpoints = filtered.filter((endpoint) => endpoint.domain === tag); if (!tagEndpoints.length) return null; return <section className="api-tag" key={tag}><div className="api-tag-heading"><h2>{tag}</h2><span>{tagEndpoints.length} opération{tagEndpoints.length > 1 ? 's' : ''}</span></div>{tagEndpoints.map((endpoint) => { const key = endpoint.method + endpoint.path; const result = results[key]; const isExpanded = expanded[key]; const canTest = Boolean(endpoint.testable && !endpoint.path.includes('[id]')); return <article className="api-card" key={key}><button className="api-summary" onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}><span className={`api-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span><code>{endpoint.path}{endpoint.query || ''}</code><strong>{endpoint.title}</strong><span className="api-auth">{endpoint.auth}</span><span>{isExpanded ? '−' : '+'}</span></button>{isExpanded && <div className="api-operation"><p>{endpoint.description}</p>{endpoint.parameters && <div className="api-parameters"><strong>Paramètres</strong>{endpoint.parameters.map((parameter) => <code key={parameter}>{parameter}</code>)}</div>}{endpoint.body && <label className="api-request-body">Request body<textarea value={requestBodies[key] ?? endpoint.body} onChange={(event) => setRequestBodies((current) => ({ ...current, [key]: event.target.value }))} spellCheck={false} /></label>}<div className="api-operation-actions"><button className="api-copy" onClick={() => void copyEndpoint(endpoint)}>{copied === endpoint.path ? 'Copié' : 'Copier curl'}</button>{canTest && <button className="api-test" onClick={() => { setTryIt((current) => ({ ...current, [key]: true })); void testEndpoint(endpoint); }} disabled={loading === key}>{loading === key ? 'Exécution…' : tryIt[key] ? 'Réanimer la requête' : 'Try it out'}</button>}{!canTest && <span className="api-muted">Saisie d’identifiant requise pour tester</span>}</div>{result && <pre className={result.status >= 200 && result.status < 300 ? 'api-result success' : 'api-result error'}><strong>HTTP {result.status || 'réseau'}</strong>{result.body}</pre>}</div>}</article>; })}</section>; })}</section>
  </main>;
}

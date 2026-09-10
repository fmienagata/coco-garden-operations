'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RESTAURANT_NAME } from '../lib/restaurant';
import { ROLE_MODULES, normalizeRole, type UserRole } from '../lib/auth';
import './ModuleNavigation.css';

const modules = [
  { href: '/salle', label: 'Salle', detail: 'Tables et commandes', path: 'M3 9h18M5 9V5h14v4M6 9v11M18 9v11M3 15h18' },
  { href: '/journal', label: 'Journal', detail: 'Actions et alertes', path: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5' },
  { href: '/cuisine', label: 'Cuisine', detail: 'Préparer les commandes', path: 'M4 10h16M5 10v9h14v-9M9 4v3m6-3v3M9 14h6' },
  { href: '/livraison', label: 'Livraisons', detail: 'Organiser les départs', path: 'M3 5h11v12H3zM14 9h4l3 4v4h-7M7 17a2 2 0 1 0 0 .1M17 17a2 2 0 1 0 0 .1' },
  { href: '/carte', label: 'Carte', detail: 'Plats et disponibilités', path: 'M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zM13 7a3 3 0 0 1 3-3h4v14h-4a3 3 0 0 0-3 3' },
  { href: '/notifications', label: 'Notifications', detail: 'Suivre les messages', path: 'M4 4h16v12H9l-5 4zM8 8h8M8 12h5' },
  { href: '/pilotage', label: 'Pilotage', detail: 'Ventes et encaissements', path: 'M4 20h17M7 16v-5M12 16V4M17 16V8' },
  { href: '/api-docs', label: 'API', detail: 'Endpoints et tests', path: 'M8 9l3 3-3 3M13 15h3M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { href: '/users', label: 'Utilisateurs', detail: 'Équipe et créateurs', path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
];
export default function ModuleNavigation() {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); setError(''); }, [pathname]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => { if (!cancelled) setRole(data.role ? normalizeRole(data.role) : null); })
      .catch(() => { if (!cancelled) setRole(null); });
    return () => { cancelled = true; };
  }, [pathname]);
  const visibleModules = role ? modules.filter(item => ROLE_MODULES[role].includes(item.href.slice(1))) : [];
  const current = modules.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
  const hasAccess = current ? !role || ROLE_MODULES[role].includes(current.href.slice(1)) : true;
  useEffect(() => { if (role && current && !hasAccess) router.replace(`/${ROLE_MODULES[role][0]}`); }, [role, current, hasAccess, router]);
  if (!current && pathname !== '/') return null;
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      setOpen(false); setRole(null); router.replace('/login'); router.refresh();
    } catch { setError('Déconnexion impossible. Réessayez.'); }
    finally { setBusy(false); }
  }
  return <div className="module-bar" onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
    <div className="module-bar__inner">
      <Link href={role ? `/${ROLE_MODULES[role][0]}` : "/"} className="module-brand" aria-label={`${RESTAURANT_NAME} — Accueil équipe`}><span className="module-brand__mark" aria-hidden="true">CG</span><span>{RESTAURANT_NAME}<small>Espace équipe</small></span></Link>
      <button ref={toggle} className="module-toggle" type="button" aria-expanded={open} aria-controls="module-links" onClick={() => setOpen(value => !value)}><span>{current?.label || 'Menu'}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={open ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg><span className="module-sr-only">{open ? 'Fermer le menu' : 'Ouvrir le menu'}</span></button>
      <div id="module-links" className={`module-menu ${open ? 'module-menu--open' : ''}`}>
        <nav aria-label="Navigation principale"><ul>{visibleModules.map(item => <li key={item.href}><Link href={item.href} aria-current={current?.href === item.href ? 'page' : undefined} onClick={() => setOpen(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.path} /></svg><span>{item.label}<small>{item.detail}</small></span>{current?.href === item.href && <span className="module-active-dot" aria-hidden="true" />}</Link></li>)}</ul></nav>
        {current ? <button className="module-logout" disabled={busy} onClick={() => void logout()}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</button> : <Link className="module-logout" href="/login" onClick={() => setOpen(false)}>Se connecter</Link>}
      </div>
    </div>
    {error && <p className="module-error" role="alert">{error}</p>}
  </div>;
}

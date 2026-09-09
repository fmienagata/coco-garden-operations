'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ModulePageHeader from '../../components/ModulePageHeader';

type Notification = { _id: string; orderNumber: string; recipientType: 'driver' | 'customer'; recipientPhone: string; message: string; status: 'pending' | 'sent' | 'failed'; attempts: number; sentAt?: string; createdAt: string };

function formatDate(value?: string) { return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '--'; }

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'driver' | 'customer'>('all');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (response.status === 401) { router.replace('/login'); return; }
    if (response.ok) setNotifications(await response.json()); else setError('Impossible de charger les notifications.');
  }
  useEffect(() => { load(); }, []);

  async function retry(notification: Notification) {
    const response = await fetch(`/api/notifications/${notification._id}/retry`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Relance impossible.'); return; }
    window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
    if (window.confirm('Confirmez-vous avoir envoyé cette notification dans WhatsApp ?')) await load();
  }

  const filtered = notifications.filter((notification) => filter === 'all' || notification.recipientType === filter);
  return <main id="module-content" tabIndex={-1} className="notifications-shell">
    <ModulePageHeader title="Notifications" description="Retrouvez les messages WhatsApp envoyés aux clients et aux livreurs." />
    {error && <p className="form-error">{error}</p>}
    <section className="notification-summary"><div><strong>{notifications.length}</strong><span>messages enregistrés</span></div><div><strong>{notifications.filter((item) => item.status === 'sent').length}</strong><span>envoyés</span></div><div><strong>{notifications.filter((item) => item.status !== 'sent').length}</strong><span>à vérifier</span></div></section>
    <nav className="notification-filters" aria-label="Filtrer les notifications"><button className={filter === 'all' ? 'filter-active' : ''} onClick={() => setFilter('all')}>Tous</button><button className={filter === 'driver' ? 'filter-active' : ''} onClick={() => setFilter('driver')}>Livreurs</button><button className={filter === 'customer' ? 'filter-active' : ''} onClick={() => setFilter('customer')}>Clients</button></nav>
    <section className="notification-list">{filtered.length === 0 ? <p className="muted">Aucun message pour ce filtre.</p> : filtered.map((notification) => <article className="notification-card" key={notification._id}><div className="notification-card-heading"><div><span className={`notification-kind ${notification.recipientType}`}>{notification.recipientType === 'driver' ? 'Livreur' : 'Client'}</span><strong>{notification.orderNumber}</strong></div><span className={`notification-status ${notification.status}`}>{notification.status === 'sent' ? 'Envoyé' : notification.status === 'failed' ? 'Échec' : 'À vérifier'}</span></div><p className="notification-recipient">{notification.recipientPhone} · {formatDate(notification.sentAt || notification.createdAt)} · {notification.attempts} tentative{notification.attempts > 1 ? 's' : ''}</p><pre>{notification.message}</pre>{notification.status !== 'sent' && <button className="notification-retry" onClick={() => retry(notification)}>Relancer dans WhatsApp</button>}</article>)}</section>
  </main>;
}

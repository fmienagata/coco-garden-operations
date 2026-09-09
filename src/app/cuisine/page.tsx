'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCfa } from '../../lib/restaurant';
import ModulePageHeader from '../../components/ModulePageHeader';

type Item = { name: string; itemCode?: string; qty: number; price: number };
type Status = 'pending' | 'confirmed' | 'preparing' | 'ready';
type Order = { _id?: string; orderNumber: string; createdByLabel?: string; createdByType?: string; fulfillmentType: 'delivery' | 'takeaway' | 'dine_in'; diningTableId?: string; diningNotes?: string; tableNumber?: number; covers?: number; customerName?: string; customerPhone?: string; deliveryAddress?: string; deliveryNotes?: string; driverPhone?: string; driverMessageSentAt?: string; customerMessageSentAt?: string; items: Item[]; total: number; status: Status; createdAt?: string };

const columns: { status: Status; label: string; action?: string; next?: Status }[] = [
  { status: 'pending', label: 'À confirmer', action: 'Confirmer', next: 'confirmed' },
  { status: 'confirmed', label: 'À préparer', action: 'Lancer la préparation', next: 'preparing' },
  { status: 'preparing', label: 'En préparation', action: 'Marquer comme prête', next: 'ready' },
  { status: 'ready', label: 'Prêtes', },
];

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

export default function CuisinePage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOrders() {
    const response = await fetch('/api/orders', { cache: 'no-store' });
    if (response.status === 401) { router.replace('/login'); return; }
    if (!response.ok) { setError('Impossible de charger les commandes.'); return; }
    setOrders(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    const interval = window.setInterval(loadOrders, 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function updateStatus(id: string | undefined, status: Status) {
    if (!id) return;
    setOrders((current) => current.map((order) => order._id === id ? { ...order, status } : order));
    const response = await fetch('/api/orders/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch: { status } }),
    });
    if (!response.ok) loadOrders();
  }


  async function sendToDriver(order: Order) {
    const driverPhone = order.driverPhone || window.prompt('Numéro WhatsApp du livreur');
    if (!driverPhone || !order._id) return;
    const response = await fetch(`/api/orders/${order._id}/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverPhone }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Impossible de préparer le message WhatsApp.'); return; }
    window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
    if (!window.confirm('Confirmez-vous avoir envoyé le message au livreur dans WhatsApp ?')) return;
    const sentResponse = await fetch(`/api/orders/${order._id}/whatsapp/sent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverPhone }) });
    if (sentResponse.ok) {
      const sentAt = new Date().toISOString();
      setOrders((current) => current.map((currentOrder) => currentOrder._id === order._id ? { ...currentOrder, driverPhone, driverMessageSentAt: sentAt } : currentOrder));
      if (window.confirm('Le livreur a été informé. Voulez-vous notifier le client maintenant ?')) await notifyCustomer({ ...order, driverPhone, driverMessageSentAt: sentAt });
    }
  }

  async function notifyCustomer(order: Order) {
    if (!order._id) return;
    const response = await fetch(`/api/orders/${order._id}/customer-notify`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Impossible de préparer le message client.'); return; }
    window.open(data.customerWhatsappUrl, '_blank', 'noopener,noreferrer');
    if (!window.confirm('Confirmez-vous avoir envoyé le message au client dans WhatsApp ?')) return;
    const sentResponse = await fetch(`/api/orders/${order._id}/customer-notify/sent`, { method: 'POST' });
    if (sentResponse.ok) setOrders((current) => current.map((currentOrder) => currentOrder._id === order._id ? { ...currentOrder, customerMessageSentAt: new Date().toISOString() } : currentOrder));
  }

  return (
    <main id="module-content" tabIndex={-1} className="kitchen-shell">
      <ModulePageHeader title="Cuisine" description="Suivez la préparation des commandes, de la réception à la remise." actions={<span className="live-indicator">● En direct</span>} />
      <section className="kitchen-summary"><div><strong>{orders.filter(order => columns.some(column => column.status === order.status)).length}</strong><span>commandes ouvertes</span></div><button onClick={loadOrders}>Actualiser</button></section>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p className="muted">Chargement des commandes…</p> : <section className="order-board">
        {columns.map((column) => {
          const columnOrders = orders.filter((order) => order.status === column.status);
          return <section className="order-column" key={column.status}>
            <div className="column-heading"><h2>{column.label}</h2><span>{columnOrders.length}</span></div>
            <div className="order-list">{columnOrders.map((order) => <article className="order-card" key={order._id}>
              <div className="order-card-top"><strong>{order.orderNumber}</strong><time>{formatTime(order.createdAt)}</time></div>
              <div className="order-channel">{order.fulfillmentType === 'dine_in' ? `En salle · Table ${order.tableNumber}${order.covers ? ` · ${order.covers} couvert${order.covers > 1 ? 's' : ''}` : ''}` : order.fulfillmentType === 'delivery' ? 'À livrer' : 'À emporter'}</div>
              {order.diningNotes && <div className="delivery-details"><strong>Consignes salle</strong><span>{order.diningNotes}</span></div>}{order.createdByLabel && <div className="order-actor">Créée par : {order.createdByLabel}</div>}
              {order.fulfillmentType === 'delivery' && <div className="delivery-details"><strong>{order.customerName || 'Client'}</strong><span>{order.customerPhone}</span><span>{order.deliveryAddress}</span>{order.deliveryNotes && <span>{order.deliveryNotes}</span>}<span className={order.driverMessageSentAt ? 'driver-message-sent' : 'driver-message-pending'}>{order.driverMessageSentAt ? `Message envoyé au livreur · ${formatTime(order.driverMessageSentAt)}` : 'Message livreur à envoyer'}</span>{order.customerMessageSentAt && <span className="driver-message-sent">Client informé · {formatTime(order.customerMessageSentAt)}</span>}</div>}
              <ul>{order.items.map((item, index) => <li key={`${item.name}-${index}`}><b>{item.qty}×</b> {item.name}</li>)}</ul>
              <div className="order-card-bottom"><span>{formatCfa(order.total)}</span><div className="order-actions">{order.fulfillmentType === 'delivery' && column.status === 'ready' && <>{<button className="whatsapp-button" onClick={() => sendToDriver(order)}>{order.driverMessageSentAt ? 'Renvoyer WhatsApp' : 'WhatsApp livreur'}</button>}{order.driverMessageSentAt && <button className="customer-button" onClick={() => notifyCustomer(order)}>{order.customerMessageSentAt ? 'Renvoyer client' : 'Notifier le client'}</button>}</>}{column.next && <button onClick={() => updateStatus(order._id, column.next!)}>{column.action}</button>}</div></div>
            </article>)}</div>
          </section>;
        })}
      </section>}
    </main>
  );
}

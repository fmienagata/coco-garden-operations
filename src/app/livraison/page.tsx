'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCfa, RESTAURANT_NAME } from '../../lib/restaurant';

type Driver = { _id: string; name: string; phone: string; active: boolean; available: boolean };
type Order = { _id: string; orderNumber: string; status: string; fulfillmentType: 'delivery' | 'takeaway'; customerName?: string; customerPhone?: string; deliveryAddress?: string; total: number; items: { name: string; qty: number }[]; driverName?: string; driverPhone?: string };
const stages = [{ status: 'ready', label: 'Prêtes' }, { status: 'driver_assigned', label: 'Livreur affecté' }, { status: 'in_delivery', label: 'En livraison' }, { status: 'delivered', label: 'Livrées' }];

export default function DeliveryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [ordersResponse, driversResponse] = await Promise.all([fetch('/api/orders', { cache: 'no-store' }), fetch('/api/drivers', { cache: 'no-store' })]);
    if (ordersResponse.status === 401) { router.replace('/login'); return; }
    if (ordersResponse.ok) setOrders((await ordersResponse.json()).filter((order: Order) => order.fulfillmentType === 'delivery'));
    if (driversResponse.ok) setDrivers(await driversResponse.json());
  }

  useEffect(() => { load(); const interval = window.setInterval(load, 15000); return () => window.clearInterval(interval); }, []);

  async function addDriver(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: driverName, phone: driverPhone }) });
    if (!response.ok) { setError('Livreur invalide.'); return; }
    setDriverName(''); setDriverPhone(''); load();
  }

  async function setAvailability(driver: Driver) {
    const response = await fetch(`/api/drivers/${driver._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available: !driver.available }) });
    if (!response.ok) setError('Impossible de modifier la disponibilité.'); else load();
  }

  async function act(id: string, action: string, selectedDriver?: string) {
    const response = await fetch(`/api/delivery/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, driverId: selectedDriver }) });
    if (!response.ok) setError((await response.json()).error || 'Action impossible.'); else load();
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }
  const availableDrivers = drivers.filter((driver) => driver.active && driver.available);

  return <main className="delivery-shell">
    <header className="delivery-header"><div><img className="kitchen-logo" src="/coco-garden-logo.svg" alt={RESTAURANT_NAME} /><p className="eyebrow">{RESTAURANT_NAME} · LIVRAISON</p><h1>Suivi des livraisons</h1><p className="muted">Les livreurs ne se connectent pas à l’application. Le management gère leur disponibilité et leur envoie les notifications.</p></div><div className="header-actions"><button className="secondary-button" onClick={() => router.push('/cuisine')}>Poste cuisine</button><button className="secondary-button" onClick={logout}>Se déconnecter</button></div></header>
    {error && <p className="form-error">{error}</p>}
    <section className="driver-panel"><div><p className="eyebrow">ÉQUIPE LIVRAISON</p><h2>{availableDrivers.length} livreur{availableDrivers.length > 1 ? 's' : ''} disponible{availableDrivers.length > 1 ? 's' : ''}</h2><div className="driver-list">{drivers.map((driver) => <span key={driver._id} className={driver.available ? 'driver-chip' : 'driver-chip inactive'}>{driver.name} · {driver.available ? 'Disponible' : 'Indisponible'} <button onClick={() => setAvailability(driver)}>{driver.available ? 'Indisponible' : 'Disponible'}</button></span>)}</div></div><form onSubmit={addDriver} className="driver-form"><input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Nom du livreur" required /><input value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} placeholder="WhatsApp +242…" required /><button>Inscrire le livreur</button></form></section>
    <section className="delivery-board">{stages.map((stage) => <section className="delivery-column" key={stage.status}><div className="column-heading"><h2>{stage.label}</h2><span>{orders.filter((order) => order.status === stage.status).length}</span></div>{orders.filter((order) => order.status === stage.status).map((order) => <article className="delivery-card" key={order._id}><div className="order-card-top"><strong>{order.orderNumber}</strong><strong>{formatCfa(order.total)}</strong></div><h3>{order.customerName || 'Client'}</h3><p>{order.customerPhone}</p><p>{order.deliveryAddress}</p><ul>{order.items.map((item) => <li key={item.name}>{item.qty}× {item.name}</li>)}</ul>{stage.status === 'ready' && <select defaultValue="" onChange={(event) => event.target.value && act(order._id, 'assign', event.target.value)}><option value="">Affecter un livreur disponible…</option>{availableDrivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.name} · {driver.phone}</option>)}</select>}{stage.status === 'driver_assigned' && <><p className="driver-assigned">{order.driverName} · {order.driverPhone}</p><button onClick={() => act(order._id, 'pickup')}>Marquer départ</button></>}{stage.status === 'in_delivery' && <button onClick={() => window.confirm('Confirmer la remise au client ?') && act(order._id, 'deliver')}>Confirmer remise</button>}{stage.status === 'delivered' && <p className="driver-assigned">Livrée</p>}</article>)}</section>)}</section>
  </main>;
}

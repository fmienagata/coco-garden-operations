'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCfa } from '../../lib/restaurant';
import ModulePageHeader from '../../components/ModulePageHeader';

type Driver = { _id: string; name: string; phone: string; active: boolean; available: boolean };
type Zone = { _id: string; name: string; fee: number; active: boolean };
type Order = { _id: string; orderNumber: string; status: string; fulfillmentType: 'delivery' | 'takeaway'; customerName?: string; customerPhone?: string; deliveryAddress?: string; deliveryZoneName?: string; deliveryFee?: number; total: number; items: { name: string; qty: number }[]; driverName?: string; driverPhone?: string };
const stages = [{ status: 'ready', label: 'Prêtes' }, { status: 'driver_assigned', label: 'Livreur affecté' }, { status: 'in_delivery', label: 'En livraison' }, { status: 'delivered', label: 'Livrées (ancien)' }, { status: 'completed', label: 'Terminées' }];

export default function DeliveryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneFee, setZoneFee] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [ordersResponse, driversResponse, zonesResponse] = await Promise.all([fetch('/api/orders', { cache: 'no-store' }), fetch('/api/drivers', { cache: 'no-store' }), fetch('/api/delivery-zones', { cache: 'no-store' })]);
    if (ordersResponse.status === 401) { router.replace('/login'); return; }
    if (ordersResponse.ok) setOrders((await ordersResponse.json()).filter((order: Order) => order.fulfillmentType === 'delivery'));
    if (driversResponse.ok) setDrivers(await driversResponse.json());
    if (zonesResponse.ok) setZones(await zonesResponse.json());
  }

  useEffect(() => { load(); const interval = window.setInterval(load, 15000); return () => window.clearInterval(interval); }, []);

  async function addDriver(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: driverName, phone: driverPhone }) });
    if (!response.ok) { setError('Livreur invalide.'); return; }
    setDriverName(''); setDriverPhone(''); load();
  }

  async function addZone(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/delivery-zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: zoneName, fee: Number(zoneFee) }) });
    if (!response.ok) { setError((await response.json()).error || 'Zone invalide.'); return; }
    setZoneName(''); setZoneFee(''); load();
  }

  async function setAvailability(driver: Driver) {
    const response = await fetch(`/api/drivers/${driver._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available: !driver.available }) });
    if (!response.ok) setError('Impossible de modifier la disponibilité.'); else load();
  }

  async function toggleZone(zone: Zone) {
    const response = await fetch(`/api/delivery-zones/${zone._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !zone.active }) });
    if (!response.ok) setError('Impossible de modifier la zone.'); else load();
  }

  async function act(id: string, action: string, selectedDriver?: string) {
    const response = await fetch(`/api/delivery/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, driverId: selectedDriver }) });
    if (!response.ok) setError((await response.json()).error || 'Action impossible.'); else load();
  }

  const availableDrivers = drivers.filter((driver) => driver.active && driver.available);
  const activeZones = zones.filter((zone) => zone.active);

  return <main id="module-content" tabIndex={-1} className="delivery-shell">
    <ModulePageHeader title="Livraisons" description="Organisez les départs, les livreurs et les zones de livraison." />
    {error && <p className="form-error">{error}</p>}
    <section className="driver-panel"><div><p className="eyebrow">ÉQUIPE LIVRAISON</p><h2>{availableDrivers.length} livreur{availableDrivers.length > 1 ? 's' : ''} disponible{availableDrivers.length > 1 ? 's' : ''}</h2><div className="driver-list">{drivers.map((driver) => <span key={driver._id} className={driver.available ? 'driver-chip' : 'driver-chip inactive'}>{driver.name} · {driver.available ? 'Disponible' : 'Indisponible'} <button onClick={() => setAvailability(driver)}>{driver.available ? 'Indisponible' : 'Disponible'}</button></span>)}</div></div><form onSubmit={addDriver} className="driver-form"><input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Nom du livreur" required /><input value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} placeholder="WhatsApp +242…" required /><button>Inscrire le livreur</button></form></section>
    <section className="zone-panel"><div><p className="eyebrow">ZONES ET TARIFS</p><h2>{activeZones.length} zone{activeZones.length > 1 ? 's' : ''} active{activeZones.length > 1 ? 's' : ''}</h2><div className="zone-list">{zones.map((zone) => <span key={zone._id} className={zone.active ? 'zone-chip' : 'zone-chip inactive'}>{zone.name} · {formatCfa(zone.fee)} <button onClick={() => toggleZone(zone)}>{zone.active ? 'Désactiver' : 'Activer'}</button></span>)}</div></div><form onSubmit={addZone} className="zone-form"><input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Nom de zone" required /><input type="number" min="0" step="1" value={zoneFee} onChange={(event) => setZoneFee(event.target.value)} placeholder="Tarif FCFA" required /><button>Ajouter la zone</button></form></section>
    <section className="delivery-board">{stages.map((stage) => <section className="delivery-column" key={stage.status}><div className="column-heading"><h2>{stage.label}</h2><span>{orders.filter((order) => order.status === stage.status).length}</span></div>{orders.filter((order) => order.status === stage.status).map((order) => <article className="delivery-card" key={order._id}><div className="order-card-top"><strong>{order.orderNumber}</strong><strong>{formatCfa(order.total)}</strong></div><h3>{order.customerName || 'Client'}</h3><p>{order.customerPhone}</p><p>{order.deliveryAddress}</p><p className="delivery-zone-label">{order.deliveryZoneName || 'Zone non renseignée'} · Frais : {formatCfa(order.deliveryFee || 0)}</p><ul>{order.items.map((item) => <li key={item.name}>{item.qty}× {item.name}</li>)}</ul>{stage.status === 'ready' && <select defaultValue="" onChange={(event) => event.target.value && act(order._id, 'assign', event.target.value)}><option value="">Affecter un livreur disponible…</option>{availableDrivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.name} · {driver.phone}</option>)}</select>}{stage.status === 'driver_assigned' && <><p className="driver-assigned">{order.driverName} · {order.driverPhone}</p><button onClick={() => act(order._id, 'pickup')}>Marquer départ</button></>}{stage.status === 'in_delivery' && <button onClick={() => window.confirm('Confirmer la remise au client ?') && act(order._id, 'deliver')}>Confirmer remise</button>}{stage.status === 'completed' && <p className="driver-assigned">Terminée</p>}</article>)}</section>)}</section>
  </main>;
}

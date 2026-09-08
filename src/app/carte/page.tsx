'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCfa, RESTAURANT_NAME } from '../../lib/restaurant';

type MenuItem = { _id: string; itemCode: string; category: string; name: string; description: string; price: number; variants?: { label: string; price: number }[]; imageUrl?: string; active: boolean };
const initialForm = { category: 'Entrées', name: '', description: '', price: '', variants: '', imageUrl: '' };
const categoryOrder = ['Entrées', 'Plats du jour', 'Spécialités de la maison', 'Grillades', 'Brochettes', 'Côté gourmand · Pizzas', 'Côté gourmand · Burgers', 'À partager', 'Accompagnements', 'Douceurs · Glaces', 'Douceurs · Fruits frais', 'Douceurs · Dessert du jour', 'Petit-déjeuner · Formules', 'Petit-déjeuner · À la carte', 'Petit-déjeuner · Boissons'];

export default function MenuPage() {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function loadMenu() {
    const response = await fetch('/api/menu', { cache: 'no-store' });
    if (response.status === 401) { router.replace('/login'); return; }
    if (response.ok) setItems(await response.json());
    else setError('Impossible de charger la carte.');
  }

  useEffect(() => { loadMenu(); }, []);

  function updateField(field: keyof typeof initialForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const variants = form.variants.split(',').map((value) => { const [label, price] = value.split(':').map((part) => part.trim()); return label && price ? { label, price: Number(price) } : null; }).filter(Boolean);
    const payload = { ...form, price: Number(form.price), variants };
    const response = await fetch(editing ? `/api/menu/${editing}` : '/api/menu', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) { setError((await response.json()).error || 'Enregistrement impossible.'); return; }
    setForm(initialForm); setEditing(null); await loadMenu();
  }

  function edit(item: MenuItem) { setEditing(item._id); setForm({ category: item.category, name: item.name, description: item.description, price: String(item.price), variants: item.variants?.map((variant) => `${variant.label}: ${variant.price}`).join(', ') || '', imageUrl: item.imageUrl || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cet élément de la carte ?')) return;
    await fetch(`/api/menu/${id}`, { method: 'DELETE' });
    await loadMenu();
  }

  async function toggleAvailability(item: MenuItem) {
    const response = await fetch(`/api/menu/${item._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !item.active }) });
    if (!response.ok) { setError('Impossible de modifier la disponibilité.'); return; }
    setItems((current) => current.map((currentItem) => currentItem._id === item._id ? { ...currentItem, active: !item.active } : currentItem));
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }

  const normalizedSearch = search.trim().toLocaleLowerCase('fr-FR');
  const filteredItems = items.filter((item) => !normalizedSearch || [item.itemCode, item.name, item.category, item.description].some((value) => value.toLocaleLowerCase('fr-FR').includes(normalizedSearch)));
  const categories = [...new Set(filteredItems.map((item) => item.category))].sort((first, second) => (categoryOrder.indexOf(first) === -1 ? 999 : categoryOrder.indexOf(first)) - (categoryOrder.indexOf(second) === -1 ? 999 : categoryOrder.indexOf(second)));
  return <main className="menu-shell">
    <header className="menu-header"><div><img className="kitchen-logo" src="/coco-garden-logo.svg" alt={RESTAURANT_NAME} /><p className="eyebrow">{RESTAURANT_NAME} · ADMINISTRATION</p><h1>Gérer la carte</h1></div><div className="header-actions"><button className="secondary-button" onClick={() => router.push('/cuisine')}>Poste cuisine</button><button className="secondary-button" onClick={logout}>Se déconnecter</button></div></header>
    <section className="menu-form-panel"><div><p className="eyebrow">{editing ? 'MODIFIER UN ÉLÉMENT' : 'NOUVEL ÉLÉMENT'}</p><h2>{editing ? 'Modifier le plat' : 'Ajouter à la carte'}</h2></div><form onSubmit={submit} className="menu-form"><label>Catégorie<select value={form.category} onChange={(event) => updateField('category', event.target.value)}><option>Entrées</option><option>Plats du jour</option><option>Spécialités de la maison</option><option>Grillades</option><option>Brochettes</option><option>Côté gourmand</option><option>À partager</option><option>Douceurs</option><option>Accompagnements</option><option>Boissons</option><option>Autre</option></select></label><label>Nom du plat<input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Ex. Salade Coco Garden" required /></label><label>Prix de base en FCFA<input type="number" min="0" step="1" value={form.price} onChange={(event) => updateField('price', event.target.value)} required /></label><label className="wide-field">Variantes de prix<textarea rows={2} value={form.variants} onChange={(event) => updateField('variants', event.target.value)} placeholder="Ex. Petite: 5000, Grande: 7000" /></label><label className="wide-field">Description<textarea rows={2} value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Composition et informations utiles" /></label><label className="wide-field">URL de l’image<input value={form.imageUrl} onChange={(event) => updateField('imageUrl', event.target.value)} placeholder="https://… (facultatif)" /></label><div className="menu-form-actions"><button type="submit">{editing ? 'Enregistrer les modifications' : 'Ajouter à la carte'}</button>{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(initialForm); }}>Annuler</button>}</div></form>{error && <p className="form-error">{error}</p>}</section>
    <section className="menu-list"><div className="menu-list-heading"><div><p className="eyebrow">CARTE ACTUELLE</p><h2>{filteredItems.length} élément{filteredItems.length > 1 ? 's' : ''}</h2></div><span>{items.filter((item) => item.active).length} disponibles · {items.filter((item) => !item.active).length} indisponibles</span></div><label className="menu-search">Rechercher un plat<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, code, catégorie…" /></label>{categories.map((category) => <section key={category} className="menu-category"><h3>{category}</h3><div className="menu-items">{filteredItems.filter((item) => item.category === category).map((item) => <article className={`menu-item-card ${item.active ? '' : 'menu-item-unavailable'}`} key={item._id}>{item.imageUrl && <img src={item.imageUrl} alt="" /> }<div className="menu-item-content"><div className="menu-item-title"><div><span className="item-code">{item.itemCode}</span><h4>{item.name}</h4></div><strong>{formatCfa(item.price)}</strong></div><span className={`availability-badge ${item.active ? 'available' : 'unavailable'}`}>{item.active ? 'Disponible' : 'Indisponible'}</span>{item.variants && item.variants.length > 0 && <div className="menu-variants">{item.variants.map((variant) => <span key={variant.label}>{variant.label} · {formatCfa(variant.price)}</span>)}</div>}{item.description && <p>{item.description}</p>}<div><button className="text-button" onClick={() => toggleAvailability(item)}>{item.active ? 'Rendre indisponible' : 'Rendre disponible'}</button><button className="text-button" onClick={() => edit(item)}>Modifier</button><button className="text-button danger" onClick={() => remove(item._id)}>Supprimer</button></div></div></article>)}</div></section>)}</section>
  </main>;
}
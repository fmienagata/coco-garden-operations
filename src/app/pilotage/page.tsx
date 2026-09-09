'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCfa } from '../../lib/restaurant';
import ModulePageHeader from '../../components/ModulePageHeader';
import { csvCell, localDay, STATUS_LABELS, validPeriod, type Report } from '../../lib/pilotage';
import './pilotage.css';

type Row = Report['rows'][number];
const methods: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', card: 'Carte', transfer: 'Virement' };
function dateLabel(value?: string) { return value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville', dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée'; }
export default function PilotagePage() {
  const router = useRouter();
  const [from, setFrom] = useState(() => localDay()); const [to, setTo] = useState(() => localDay());
  const [demo, setDemo] = useState(false); const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [channel, setChannel] = useState('all'); const [payment, setPayment] = useState('all'); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null); const [action, setAction] = useState(''); const [method, setMethod] = useState('cash'); const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false); const [saving, setSaving] = useState(false); const [actionError, setActionError] = useState('');
  const requestNumber = useRef(0);
  const load = useCallback(async () => {
    const number = ++requestNumber.current;
    if (!validPeriod(from, to)) { setError('Choisissez une période valide de 366 jours maximum.'); setReport(null); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/pilotage?from=${from}&to=${to}&demo=${demo}`, { cache: 'no-store' });
      if (number !== requestNumber.current) return;
      if (response.status === 401) { router.replace('/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (number === requestNumber.current) { setReport(data); setUpdated(data.generatedAt); }
    } catch (err) { if (number === requestNumber.current) { setError(err instanceof Error ? err.message : 'Connexion impossible.'); setReport(null); } }
    finally { if (number === requestNumber.current) setLoading(false); }
  }, [from, to, demo, router]);
  useEffect(() => { setReport(null); setPage(1); void load(); const timer = setInterval(() => void load(), 60000); return () => { clearInterval(timer); requestNumber.current++; }; }, [load]);
  useEffect(() => { setPage(1); }, [search, status, channel, payment]);
  function period(kind: string) {
    const today = localDay(); let start = today;
    if (kind === 'week') start = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0,10);
    if (kind === 'month') start = today.slice(0,8) + '01';
    setFrom(start); setTo(today);
  }
  const rows = (report?.rows || []).filter(row => {
    const pay = row.settlement?.refundedAt ? 'refunded' : row.settlement?.paidAt ? 'paid' : 'unknown';
    return (status === 'all' || row.status === status) && (channel === 'all' || row.fulfillmentType === channel) && (payment === 'all' || pay === payment) && `${row.orderNumber} ${row.customerName || ''}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'));
  });
  const pages = Math.max(1, Math.ceil(rows.length / 20)); const currentPage = Math.min(page, pages);
  function exportCsv() {
    const lines = [['Commande', 'Client', 'Créée le (Pointe-Noire)', 'Statut', 'Mode', 'Montant FCFA', 'Paiement', 'Encaissé FCFA', 'Encaissé le', 'Remboursé le', 'Démonstration'], ...rows.map(row => [row.orderNumber, row.customerName, dateLabel(row.createdAt), STATUS_LABELS[row.status] || row.status, row.fulfillmentType === 'dine_in' ? 'En salle' : row.fulfillmentType === 'delivery' ? 'Livraison' : 'À emporter', row.total, row.settlement?.paidAt ? methods[row.settlement.method!] : 'Non renseigné', row.settlement?.amount ?? '', row.settlement?.paidAt ? dateLabel(row.settlement.paidAt) : '', row.settlement?.refundedAt ? dateLabel(row.settlement.refundedAt) : '', row.isDemo ? 'Oui' : 'Non'])];
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.map(line => line.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `coco-garden-${from}-${to}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function open(row: Row) { setSelected(row); setAction(''); setActionError(''); setConfirmed(false); setReason(''); }
  async function save() {
    if (!selected || !action || !confirmed || saving) return;
    setSaving(true); setActionError('');
    try {
      const response = await fetch('/api/pilotage/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: selected._id, action, method, reason, confirmed }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setSelected(null); setNotice('Déclaration enregistrée.'); await load();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }
  const summary = report?.summary;
  const maxSales = Math.max(1, ...(report?.daily.map(day => day.sales) || []));
  return <main id="module-content" tabIndex={-1} className="pilot-shell">
    <ModulePageHeader title="Pilotage" description="Suivez les ventes, les encaissements et l’activité du restaurant." />
    <section className="pilot-toolbar" aria-label="Période du rapport"><div className="pilot-presets"><button onClick={() => period('today')}>Aujourd’hui</button><button onClick={() => period('week')}>7 derniers jours</button><button onClick={() => period('month')}>Ce mois</button></div><div className="pilot-dates"><label>Du<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Au<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><button disabled={loading} onClick={() => void load()}>{loading ? 'Chargement…' : 'Actualiser'}</button></div><label className="pilot-check"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> Inclure les commandes de démonstration</label><small>Heure de Pointe-Noire · Actualisation toutes les minutes{updated && ` · Dernière lecture : ${dateLabel(updated)}`}</small></section>
    {demo && <p className="pilot-warning">Mode démonstration inclus : les chiffres peuvent contenir des commandes fictives.</p>}
    {error && <p role="alert" className="form-error">{error} <button onClick={() => void load()}>Réessayer</button></p>}
    {notice && <p className="pilot-success" role="status">{notice}</p>}
    {!report && loading && <p role="status">Chargement des indicateurs…</p>}
    {report && summary && <>
      <section className="pilot-kpis" aria-label="Indicateurs de la période">
        <article><span>Commandes reçues</span><strong>{summary.orders}</strong><small>{summary.open} encore ouvertes · {summary.cancelled} annulées</small></article>
        <article className="pilot-kpi-featured"><span>Ventes finalisées</span><strong>{formatCfa(summary.sales)}</strong><small>{summary.finalized} commandes remises sur la période</small></article>
        <article><span>Encaissements nets</span><strong>{formatCfa(summary.netReceipts)}</strong><small>{formatCfa(summary.receipts)} reçus − {formatCfa(summary.refunds)} remboursés</small></article>
        <article><span>Panier moyen finalisé</span><strong>{formatCfa(summary.finalized ? Math.round(summary.sales / summary.finalized) : 0)}</strong><small>Ventes finalisées ÷ commandes remises</small></article>
      </section>
      <div className="pilot-notes"><span>Montant commandé hors annulations : <b>{formatCfa(summary.ordered)}</b></span><span>Ventes finalisées sans encaissement déclaré : <b>{formatCfa(summary.unpaid)}</b></span></div>
      {summary.missingCompletionDate > 0 && <p className="pilot-warning">{summary.missingCompletionDate} commande(s) finalisée(s) créée(s) sur la période sans date de remise : exclue(s) des ventes pour ne pas inventer la date.</p>}
      <section className="pilot-charts">
        <article><h2>Ventes par jour</h2><p>Montants des remises confirmées, avant remboursements.</p><div className="pilot-bars">{report.daily.filter(d => d.sales || report.daily.length <= 7).map(day => <div className="pilot-bar-row" key={day.day}><span>{day.day.slice(8)}/{day.day.slice(5,7)}</span><div><i style={{ width: `${day.sales / maxSales * 100}%` }} /></div><b>{formatCfa(day.sales)}</b></div>)}{!report.daily.some(d => d.sales) && report.daily.length > 7 && <p>Aucune vente finalisée sur cette période.</p>}</div></article>
        <article><h2>Les plats les plus vendus</h2><p>Classement par montant des commandes finalisées.</p>{!report.products.length ? <p className="pilot-empty">Les premières ventes apparaîtront ici.</p> : <ol className="pilot-products">{report.products.map(product => <li key={product.name}><span>{product.name}<small>{product.qty} vendu(s)</small></span><b>{formatCfa(product.total)}</b></li>)}</ol>}</article>
      </section>
      <section className="pilot-history"><div className="pilot-section-heading"><div><h2>Historique des commandes</h2><p>Commandes créées, remises, encaissées ou remboursées sur la période.</p></div><button disabled={!rows.length || loading} onClick={exportCsv}>Exporter CSV ({rows.length})</button></div>
        <div className="pilot-filters"><label>Rechercher<input placeholder="Numéro ou client…" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Statut<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tous les statuts</option>{Object.entries(STATUS_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Service<select value={channel} onChange={e => setChannel(e.target.value)}><option value="all">Tous les services</option><option value="delivery">Livraison</option><option value="takeaway">À emporter</option><option value="dine_in">En salle</option></select></label><label>Paiement<select value={payment} onChange={e => setPayment(e.target.value)}><option value="all">Tous les paiements</option><option value="unknown">Non renseigné</option><option value="paid">Encaissé</option><option value="refunded">Remboursé</option></select></label></div>
        <p className="pilot-caption">Les filtres ci-dessus s’appliquent à l’historique et à son export. Les indicateurs gardent toute la période.</p>
        <div className="pilot-table-scroll"><table><thead><tr><th>Commande / client</th><th>Créée le</th><th>Service</th><th>Statut</th><th>Montant</th><th>Paiement</th><th>Détail</th></tr></thead><tbody>{rows.slice((currentPage-1)*20,currentPage*20).map(row => <tr key={row._id}><td><strong>{row.orderNumber}</strong><small>{row.customerName || 'Client non renseigné'}{row.isDemo && ' · Démo'}</small></td><td>{dateLabel(row.createdAt)}</td><td>{row.fulfillmentType === 'dine_in' ? 'En salle' : row.fulfillmentType === 'delivery' ? 'Livraison' : 'À emporter'}</td><td><span className={`pilot-status ${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span></td><td className="pilot-money">{formatCfa(row.total)}</td><td>{row.settlement?.refundedAt ? 'Remboursé' : row.settlement?.paidAt ? 'Encaissé' : 'Non renseigné'}</td><td><button aria-label={`Détail ${row.orderNumber}`} onClick={() => open(row)}>Consulter</button></td></tr>)}</tbody></table></div>
        {!rows.length && <p className="pilot-empty">Aucune commande pour cette période et ces filtres.</p>}
        <div className="pilot-pagination"><span>{rows.length} commande(s) · Page {currentPage} / {pages}</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage-1)}>Précédent</button><button disabled={currentPage === pages} onClick={() => setPage(currentPage+1)}>Suivant</button></div>
      </section>
      <details className="pilot-definitions"><summary>Comment sont calculés les indicateurs ?</summary><p>Les commandes reçues suivent leur date de création. Les ventes suivent la date de livraison ou de retrait confirmé ; une commande prête reste ouverte. Les encaissements et remboursements suivent la date de déclaration par l’équipe. Un paiement n’est jamais déduit du statut de livraison. Les montants sont en FCFA, sans frais ou taxes inventés. Les remboursements ne modifient pas le montant brut des ventes finalisées.</p><p>Cette version enregistre uniquement un règlement intégral et, si nécessaire, un remboursement intégral par commande. Les paiements partiels et connexions bancaires ne sont pas pris en charge. L’absence de déclaration signifie « non renseigné », pas une preuve d’impayé.</p></details>
    </>}
    {selected && <div className="pilot-overlay" onKeyDown={e => { if (e.key === 'Escape' && !saving) setSelected(null); if (e.key === 'Tab') { const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')); const first = focusable[0]; const last = focusable[focusable.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><section className="pilot-dialog" role="dialog" aria-modal="true" aria-labelledby="pilot-detail-title"><div className="pilot-section-heading"><h2 id="pilot-detail-title">{selected.orderNumber}</h2><button autoFocus disabled={saving} onClick={() => setSelected(null)}>Fermer</button></div><p>{selected.customerName || 'Client non renseigné'} · {STATUS_LABELS[selected.status] || selected.status}</p><ul>{selected.items.map((item,i) => <li key={i}>{item.qty} × {item.name} <b>{formatCfa(item.qty*item.price)}</b></li>)}</ul><p className="pilot-detail-total">Total <strong>{formatCfa(selected.total)}</strong></p><p>Création : {dateLabel(selected.createdAt)}<br />Remise : {dateLabel(selected.completedAt)}</p>{selected.settlement?.paidAt && <p>Encaissé : {formatCfa(selected.settlement.amount!)} · {methods[selected.settlement.method!]}<br />{dateLabel(selected.settlement.paidAt)} · {selected.settlement.paidBy}</p>}{selected.settlement?.refundedAt && <p>Remboursé le {dateLabel(selected.settlement.refundedAt)} · {selected.settlement.refundedBy}<br />Motif : {selected.settlement.refundReason}</p>}
      <div className="pilot-action-options">{selected.fulfillmentType !== 'dine_in' && !selected.settlement?.paidAt && selected.status !== 'cancelled' && <button disabled={saving} onClick={() => { setAction('pay'); setConfirmed(false); }}>Déclarer un encaissement</button>}{selected.settlement?.paidAt && !selected.settlement.refundedAt && <button disabled={saving} onClick={() => { setAction('refund'); setConfirmed(false); }}>Déclarer un remboursement</button>}{selected.fulfillmentType === 'takeaway' && selected.status === 'ready' && <button disabled={saving} onClick={() => { setAction('collect'); setConfirmed(false); }}>Confirmer le retrait</button>}</div>
      {action && <form className="pilot-action-form" onSubmit={e => { e.preventDefault(); void save(); }}><p>{action === 'pay' ? `Déclaration du règlement intégral de ${formatCfa(selected.total)}.` : action === 'refund' ? `Déclaration du remboursement intégral de ${formatCfa(selected.settlement!.amount!)}.` : 'Confirmation de la remise physique au client.'}</p>{action === 'pay' && <label>Moyen de paiement<select value={method} disabled={saving} onChange={e => setMethod(e.target.value)}>{Object.entries(methods).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}{action === 'refund' && <label>Motif<textarea value={reason} disabled={saving} required minLength={3} maxLength={500} onChange={e => setReason(e.target.value)} /></label>}<label className="pilot-check"><input type="checkbox" checked={confirmed} disabled={saving} onChange={e => setConfirmed(e.target.checked)} required />{action === 'collect' ? 'Je confirme que la commande a été remise au client.' : 'Je confirme que ce mouvement d’argent a déjà eu lieu.'}</label><small>Enregistrement de suivi uniquement. Aucun transfert d’argent n’est effectué.</small>{actionError && <p role="alert" className="form-error">{actionError}</p>}<button type="submit" disabled={!confirmed || saving}>{saving ? 'Enregistrement…' : 'Enregistrer la déclaration'}</button></form>}
    </section></div>}
  </main>;
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ModulePageHeader from '../../components/ModulePageHeader';
import './journal.css';
type Event={_id:string;actor:string;actorType:string;operation:string;status:number;result:string;occurredAt:string};
type Data={events:Event[];total:number;page:number;pageSize:number;summary:{_id:string;count:number}[];alerts:{_id:{actor:string;actorType:string;operation:string};count:number;lastAt:string}[];operations:string[];health:{lastWriteFailure:string|null}};
const actorTypes:Record<string,string>={management:'Équipe',whatsapp_agent:'Agent WhatsApp',unverified_agent:'Agent non authentifié',anonymous:'Non authentifié'};
const results:Record<string,string>={success:'Réussite',denied:'Accès refusé',failure:'Échec'};
const displayActor=(actor:string)=>actor==='anonymous'?'Non authentifié':actor==='unverified-agent'?'Agent non authentifié':actor==='whatsapp-agent'?'Agent WhatsApp':actor;
const date=(value:string)=>new Date(value).toLocaleString('fr-FR');
export default function JournalPage(){
  const router=useRouter();const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [refresh,setRefresh]=useState(0);const [updated,setUpdated]=useState('');
  const [page,setPage]=useState(1);const [result,setResult]=useState('');const [actorType,setActorType]=useState('');const [operation,setOperation]=useState('');const [period,setPeriod]=useState('24');
  useEffect(()=>{let alive=true;const controller=new AbortController();async function load(){setLoading(true);setError('');try{
    const params=new URLSearchParams({page:String(page),result,actorType,operation,from:new Date(Date.now()-Number(period)*60*60*1000).toISOString()});
    const response=await fetch('/api/audit?'+params,{cache:'no-store',signal:controller.signal});
    if(response.status===401){router.replace('/login');return;}const body=await response.json();if(!response.ok)throw new Error(body.error||'Journal indisponible.');
    if(alive){setData(body);setUpdated(new Date().toLocaleTimeString('fr-FR'));}
  }catch(e){if(alive)setError(e instanceof Error?e.message:'Chargement impossible.');}finally{if(alive)setLoading(false);}}
  void load();const timer=setInterval(()=>setRefresh(v=>v+1),30000);return()=>{alive=false;controller.abort();clearInterval(timer);};},[page,result,actorType,operation,period,refresh,router]);
  const count=(key:string)=>data?.summary.find(s=>s._id===key)?.count||0;
  return <main id="module-content" tabIndex={-1} className="journal-shell">
    <ModulePageHeader title="Journal d’activité" description="Suivez les actions de l’équipe et de l’Agent WhatsApp, ainsi que les tentatives d’accès refusées." actions={<button className="secondary-button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>{loading?'Chargement…':'Actualiser'}</button>}/>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {data?.health.lastWriteFailure&&<p className="journal-warning" role="alert">Une écriture du journal a échoué à {date(data.health.lastWriteFailure)}. Certains événements peuvent manquer.</p>}
    {Boolean(data?.alerts.length)&&<section className="journal-alerts" aria-label="Alertes de sécurité"><h2>Échecs répétés détectés</h2><p>Au moins 5 échecs en 10 minutes, indépendamment des filtres ci-dessous. Les tentatives non authentifiées sont regroupées, sans attribution à une personne.</p><div aria-live="polite">{data!.alerts.map(a=><article key={a._id.actor+a._id.operation}><strong>{displayActor(a._id.actor)} · {a.count} échecs</strong><code>{a._id.operation}</code><small>Dernier échec : {date(a.lastAt)}</small></article>)}</div></section>}
    <section className="journal-kpis" aria-label="Résumé de la sélection"><article><span>Événements</span><strong>{data?.total??'—'}</strong></article><article><span>Réussites</span><strong>{count('success')}</strong></article><article><span>Accès refusés</span><strong>{count('denied')}</strong></article><article><span>Échecs</span><strong>{count('failure')}</strong></article></section>
    <section className="journal-panel"><div className="journal-filters">
      <label>Période<select value={period} onChange={e=>{setPeriod(e.target.value);setPage(1);setOperation('');}}><option value="1">Dernière heure</option><option value="24">Dernières 24 heures</option><option value="168">7 derniers jours</option><option value="720">30 derniers jours</option></select></label>
      <label>Acteur<select value={actorType} onChange={e=>{setActorType(e.target.value);setPage(1);}}><option value="">Tous les acteurs</option>{Object.entries(actorTypes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Résultat<select value={result} onChange={e=>{setResult(e.target.value);setPage(1);}}><option value="">Tous les résultats</option>{Object.entries(results).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Opération<select value={operation} onChange={e=>{setOperation(e.target.value);setPage(1);}}><option value="">Toutes les opérations</option>{data?.operations.map(op=><option key={op} value={op}>{op}</option>)}</select></label>
    </div><p className="journal-note">Modifications, connexions et lectures API en échec · Conservation : 90 jours · Heures locales{updated?' · Actualisé à '+updated:''}</p>
    <div className="journal-table"><table><thead><tr><th>Date et heure</th><th>Acteur</th><th>Opération</th><th>Résultat</th><th>Code HTTP</th></tr></thead><tbody>{data?.events.map(e=><tr key={e._id}><td><time dateTime={e.occurredAt}>{date(e.occurredAt)}</time></td><td><strong>{displayActor(e.actor)}</strong><small>{actorTypes[e.actorType]}</small></td><td><code>{e.operation}</code></td><td><span className={'journal-result '+e.result}>{results[e.result]}</span></td><td>{e.status}</td></tr>)}</tbody></table></div>
    {!loading&&!error&&data?.total===0&&<p className="journal-empty">Aucune action enregistrée pour ces filtres. Les nouvelles actions apparaîtront ici.</p>}
    <div className="journal-pagination"><span>{data?.total||0} résultat(s) · Page {page} / {Math.max(1,Math.ceil((data?.total||0)/25))}</span><button className="secondary-button" disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Précédent</button><button className="secondary-button" disabled={loading||page*25>=(data?.total||0)} onClick={()=>setPage(p=>p+1)}>Suivant</button></div></section>
    <p className="journal-note">Aucun mot de passe, jeton, en-tête, corps de requête ou contenu de message n’est enregistré. Une réussite indique que l’API a accepté l’opération ; elle ne prouve pas la réception d’un message WhatsApp.</p>
  </main>;
}

'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ModulePageHeader from '../../components/ModulePageHeader';

type Role = 'admin' | 'serveur' | 'cuisinier' | 'whatsapp_agent' | 'manager' | 'kitchen' | 'operations';
type User = { _id:string; login:string; name:string; role:Role; active:boolean; authType?:string; createdAt?:string; updatedAt?:string };
const labels: Record<string,string> = {admin:'Administrateur',manager:'Administrateur',serveur:'Serveur',operations:'Serveur',cuisinier:'Cuisinier',kitchen:'Cuisinier',whatsapp_agent:'Agent WhatsApp'};
const empty = {name:'',login:'',password:'',role:'serveur',active:true};
export default function UsersPage() {
  const router=useRouter();
  const [users,setUsers]=useState<User[]>([]);
  const [current,setCurrent]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [mode,setMode]=useState<'create'|'view'|'edit'|'delete'|null>(null);
  const [selected,setSelected]=useState<User|null>(null);
  const [form,setForm]=useState(empty);
  const [formError,setFormError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  async function load() {
    setLoading(true); setError('');
    try {
      const response=await fetch('/api/users',{cache:'no-store'});
      if(response.status===401){router.replace('/login');return;}
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Chargement impossible.');
      setUsers(data);
    } catch(e) {setError(e instanceof Error ? e.message : 'Connexion impossible.');}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load(); fetch('/api/auth/session').then(r=>r.json()).then(s=>setCurrent(s.login || '')).catch(()=>{});},[]);
  useEffect(()=>{if(mode)dialog.current?.showModal();else dialog.current?.close();},[mode]);
  function open(next:NonNullable<typeof mode>,user:User|null=null){
    setSelected(user);setFormError('');setMode(next);
    setForm(user ? {name:user.name,login:user.login,password:'',role:user.role==='manager'?'admin':user.role==='kitchen'?'cuisinier':user.role==='operations'?'serveur':user.role,active:user.active} : empty);
  }
  function close(){if(!busy){setMode(null);setFormError('');}}
  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setFormError('');setMessage('');
    try {
      const service=selected?.authType==='api_token';
      const body=service ? {name:form.name,active:form.active} : {...form};
      const response=await fetch(mode==='create'?'/api/users':'/api/users/'+selected!._id,{method:mode==='delete'?'DELETE':mode==='create'?'POST':'PATCH',headers:{'Content-Type':'application/json'},...(mode==='delete'?{}:{body:JSON.stringify(body)})});
      if(!response.ok){const data=await response.json();throw new Error(data.error || 'Opération impossible.');}
      const ownPassword=mode==='edit' && selected?.login===current && Boolean(form.password);
      setMessage(mode==='delete'?'Utilisateur supprimé.':mode==='create'?'Utilisateur créé.':'Modifications enregistrées.');
      setMode(null);
      if(ownPassword){router.replace('/login');router.refresh();return;}
      await load();
    }catch(e){setFormError(e instanceof Error?e.message:'Connexion impossible. Réessayez.');}
    finally{setBusy(false);}
  }
  const visible=users.filter(u=>(filter==='all'||(filter==='active'?u.active:!u.active)) && (u.name+' '+u.login+' '+labels[u.role]).toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  const own=selected?.login===current;
  const service=selected?.authType==='api_token';
  return <main id="module-content" tabIndex={-1} className="users-shell">
    <ModulePageHeader title="Utilisateurs" description="Consultez les comptes, gérez les rôles et contrôlez les accès de votre équipe." actions={<button className="user-primary" onClick={()=>open('create')}>+ Nouvel utilisateur</button>} />
    {error && <p className="form-error" role="alert">{error} <button className="secondary-button" onClick={()=>void load()}>Réessayer</button></p>}
    {message && <p className="user-success" role="status">{message}</p>}
    <section className="user-list" aria-label="Liste des utilisateurs">
      <div className="user-toolbar"><h2>{users.length} utilisateur{users.length>1?'s':''}</h2><div><label>Rechercher<input type="search" placeholder="Nom, identifiant ou rôle" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Statut<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous les comptes</option><option value="active">Actifs</option><option value="inactive">Désactivés</option></select></label><button className="secondary-button" disabled={loading} onClick={()=>void load()}>Actualiser</button></div></div>
      {loading?<p className="muted" role="status">Chargement des utilisateurs…</p>:visible.length===0?<p className="muted">Aucun utilisateur ne correspond à votre recherche.</p>:visible.map(user=><article key={user._id} className="user-row"><div className="user-identity"><strong>{user.name}{user.login===current && <small> · Vous</small>}</strong><span>{user.login} · {user.authType==='api_token'?'Clé API':'Mot de passe'}</span></div><div className="user-tags"><span className="user-role">{labels[user.role] || user.role}</span><span className={'user-state '+(user.active?'is-active':'')}>{user.active?'Actif':'Désactivé'}</span></div><div className="user-actions"><button onClick={()=>open('view',user)} aria-label={'Consulter '+user.name}>Consulter</button><button onClick={()=>open('edit',user)} aria-label={'Modifier '+user.name}>Modifier</button><button className="user-danger" disabled={user.login===current} title={user.login===current?'Votre propre compte ne peut pas être supprimé':undefined} onClick={()=>open('delete',user)} aria-label={'Supprimer '+user.name}>Supprimer</button></div></article>)}
    </section>
    <dialog ref={dialog} className="user-dialog" onCancel={e=>{e.preventDefault();close();}} onClose={()=>{if(!busy)setMode(null);}} aria-labelledby="user-dialog-title">
      <div className="user-dialog-heading"><h2 id="user-dialog-title">{mode==='create'?'Nouvel utilisateur':mode==='edit'?'Modifier le compte':mode==='delete'?'Supprimer le compte':'Détails du compte'}</h2><button type="button" className="secondary-button" disabled={busy} onClick={close} aria-label="Fermer">×</button></div>
      {mode==='view' && selected?<><dl className="user-details"><dt>Nom</dt><dd>{selected.name}</dd><dt>Identifiant</dt><dd>{selected.login}</dd><dt>Rôle</dt><dd>{labels[selected.role]}</dd><dt>Statut</dt><dd>{selected.active?'Actif':'Désactivé'}</dd><dt>Connexion</dt><dd>{service?'Clé API WhatsApp':'Mot de passe'}</dd><dt>Créé le</dt><dd>{selected.createdAt?new Date(selected.createdAt).toLocaleString('fr-FR'):'—'}</dd></dl><div className="user-dialog-actions"><button className="secondary-button" onClick={close}>Fermer</button><button className="user-primary" onClick={()=>open('edit',selected)}>Modifier</button></div></>:<form onSubmit={save}>
        {mode==='delete'?<p className="muted">Supprimer le compte <strong>{selected?.name}</strong> ({selected?.login}) ? Il disparaîtra de la liste et perdra son accès. L’historique de ses commandes sera conservé.</p>:<div className="user-fields">
          <label>Nom complet<input autoFocus required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} disabled={busy}/></label>
          <label>Identifiant<input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" value={form.login} disabled={busy||service||own} onChange={e=>setForm({...form,login:e.target.value})}/></label>
          {!service && <><label>Rôle<select value={form.role} disabled={busy||own} onChange={e=>setForm({...form,role:e.target.value})}><option value="admin">Administrateur</option><option value="serveur">Serveur</option><option value="cuisinier">Cuisinier</option></select></label><label>{mode==='create'?'Mot de passe':'Nouveau mot de passe (facultatif)'}<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required={mode==='create'} value={form.password} disabled={busy} onChange={e=>setForm({...form,password:e.target.value})}/><small>{mode==='create'?'8 caractères minimum.':'Laissez vide pour conserver le mot de passe actuel.'}</small></label></>}
          <label>Statut<select value={form.active?'active':'inactive'} disabled={busy||own} onChange={e=>setForm({...form,active:e.target.value==='active'})}><option value="active">Actif</option><option value="inactive">Désactivé</option></select></label>
          {service && <p className="muted">L’Agent WhatsApp se connecte par clé API. Son identifiant et son rôle sont fixes.</p>}
          {own && <p className="muted">Votre identifiant et vos droits sont protégés. Changer votre mot de passe vous demandera de vous reconnecter.</p>}
        </div>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="user-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={close}>Annuler</button><button className={mode==='delete'?'user-delete-confirm':'user-primary'} disabled={busy} type="submit">{busy?'Enregistrement…':mode==='delete'?'Supprimer le compte':mode==='create'?'Créer le compte':'Enregistrer'}</button></div>
      </form>}
    </dialog>
  </main>;
}

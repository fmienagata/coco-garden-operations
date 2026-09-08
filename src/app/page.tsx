import { RESTAURANT_NAME } from '../lib/restaurant';

const modules = [
  ["01", "Cuisine", "Commandes confirmées, préparation et commandes prêtes."],
  ["02", "Livraison", "Affectation des livreurs, départs et confirmation de remise."],
  ["03", "Notifications", "Messages WhatsApp déclenchés par les événements réels."],
  ["04", "Pilotage", "Suivi des commandes, ventes finalisées et encaissements."],
];

export default function Home() {
  return (
    <main>
      <header><img className="brand-logo" src="/coco-garden-logo.svg" alt={`${RESTAURANT_NAME} — Restaurant & Bar`} /><a className="badge" href="/login">Accéder à la cuisine</a></header>
      <section className="intro">
        <p className="eyebrow">CUISINE & LIVRAISON</p>
        <h1>Chaque commande,<br />du début à la remise.</h1>
        <p>Le socle de votre espace de gestion est prêt. Les modules métier seront connectés progressivement à votre agent IA.</p>
      </section>
      <section className="grid" aria-label="Modules prévus">
        {modules.map(([number, title, description]) => <article key={number}><span className="number">{number}</span><h2>{title}</h2><p>{description}</p>{title === 'Pilotage' ? <a className="status" href="/pilotage">Ouvrir le module</a> : title === 'Livraison' ? <a className="status" href="/livraison">Ouvrir le module</a> : <span className="status">À développer</span>}</article>)}
      </section>
      <footer>Le poste cuisine est disponible. Livraison, notifications et pilotage seront ajoutés ensuite.</footer>
    </main>
  );
}

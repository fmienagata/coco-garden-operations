const modules = [
  ["01", "Cuisine", "Commandes confirmées, préparation et commandes prêtes."],
  ["02", "Livraison", "Affectation des livreurs, départs et confirmation de remise."],
  ["03", "Notifications", "Messages WhatsApp déclenchés par les événements réels."],
  ["04", "Pilotage", "Suivi des commandes, ventes finalisées et encaissements."],
];

export default function Home() {
  return (
    <main>
      <header><strong>COCO GARDEN <span>🌿</span></strong><span className="badge">Initialisation du projet</span></header>
      <section className="intro">
        <p className="eyebrow">CUISINE & LIVRAISON</p>
        <h1>Chaque commande,<br />du début à la remise.</h1>
        <p>Le socle de votre espace de gestion est prêt. Les modules métier seront connectés progressivement à votre agent IA.</p>
      </section>
      <section className="grid" aria-label="Modules prévus">
        {modules.map(([number, title, description]) => <article key={number}><span className="number">{number}</span><h2>{title}</h2><p>{description}</p><span className="status">À développer</span></article>)}
      </section>
      <footer>Version de démarrage · Aucune commande réelle · Supabase et WhatsApp non connectés</footer>
    </main>
  );
}

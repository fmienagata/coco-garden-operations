const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const items = [
  ['Entrées', 'Salade Coco Garden', 'Mesclun et jeunes pousses, avocat, mangue fraîche, tomates cerises, poulet grillé émietté, noix, vinaigrette balsamique au miel et à la moutarde', 3000],
  ['Entrées', 'Salade de thon', 'Mesclun et jeunes pousses, maïs doux, tomates cerises, thon émietté, citron frais, vinaigrette au citron', 2500],
  ['Entrées', 'Salade d’avocat & crevettes', 'Avocat frais, crevettes, mesclun, vinaigrette maison', 3000],
  ['Entrées', 'Assiette à partager', '2 samoussas, 2 nems, 2 ailes de poulet marinées, bananes plantains et sauces', 4000],
  ['Plats du jour', 'Ailes de poulet sautées', '', 2500],
  ['Plats du jour', 'Poulet aux petits pois', '', 3000],
  ['Plats du jour', 'Bouillon de côtes ou côtes sautées', '', 3000],
  ['Plats du jour', 'Bouillon sauvage', '', 3500],
  ['Plats du jour', 'Bouillon de poisson bar', '', 3500],
  ['Plats du jour', 'Sole meunière', '', 3500],
  ['Plats du jour', 'Queue de bœuf sautée ou en bouillon', '', 4000],
  ['Plats du jour', 'Queue de bœuf à la pâte d’arachide', '', 4000],
  ['Plats du jour', 'Ragoût de queue de bœuf', '', 4500],
  ['Spécialités de la maison', 'Poisson salé aux aubergines', 'Mijoté aux oignons, poivrons et aubergines fondantes, touche de citron vert', 3500],
  ['Spécialités de la maison', 'Saka-saka aux feuilles de manioc', 'Feuilles de manioc pilées et mijotées, servi avec riz ou manioc', 3000],
  ['Spécialités de la maison', 'Poisson salé aux légumes', 'Légumes frais sautés à l’ail et aux herbes', 4000],
  ['Accompagnements', 'Riz, plantain, frites ou manioc', 'Au choix, avec chaque plat', 1000],
  ['Grillades', 'Bar', 'Poisson entier grillé à la braise. Prix selon la taille de la pièce.', 5000, [['Petite pièce', 5000], ['Moyenne pièce', 6000], ['Grande pièce', 7000], ['Très grande pièce', 8000]]],
  ['Grillades', 'Likouf', 'Poisson entier grillé à la braise.', 5000, [['Petite pièce', 5000], ['Moyenne pièce', 6000], ['Grande pièce', 8000]]],
  ['Grillades', 'Sole', 'Poisson entier grillé à la braise.', 4500, [['Petite pièce', 4500], ['Moyenne pièce', 5000], ['Grande pièce', 6000]]],
  ['Grillades', 'Girel', 'Poisson entier grillé à la braise.', 3000, [['Petite pièce', 3000], ['Grande pièce', 3500]]],
  ['Grillades', 'Langouste grillée entière', 'Langouste grillée à la braise.', 15000],
  ['Brochettes', 'Brochette de poulet', '', 3000],
  ['Brochettes', 'Brochette de poisson', '', 5000],
  ['Brochettes', 'Brochette de bœuf', '', 6000],
  ['Brochettes', 'Brochette de gambas', '', 6000],
  ['Côté gourmand · Pizzas', 'Coco Garden', 'Poulet grillé, poivrons, oignons rouges, olives vertes', 5000],
  ['Côté gourmand · Pizzas', 'Poulet BBQ', 'Sauce BBQ, poulet grillé, oignons caramélisés', 4500],
  ['Côté gourmand · Pizzas', '4 Fromages', 'Mozzarella, emmental, cheddar, vache qui rit', 4500],
  ['Côté gourmand · Pizzas', 'Reine', 'Jambon, champignons, mozzarella', 4000],
  ['Côté gourmand · Pizzas', 'Viande hachée', 'Bœuf assaisonné, oignons, poivrons', 4500],
  ['Côté gourmand · Burgers', 'Coco Burger', 'Steak haché, cheddar, sauce maison', 4500],
  ['Côté gourmand · Burgers', 'Chicken Burger', 'Poulet croustillant, cheddar', 4500],
  ['Côté gourmand · Burgers', 'BBQ Burger', 'Steak, bacon, oignons caramélisés, sauce BBQ', 5500],
  ['Côté gourmand · Burgers', 'Spicy Burger', 'Steak, cheddar, sauce pimentée maison', 5000],
  ['À partager', 'Le Plateau Coco Garden', 'Poulet et calamar grillés, gambas, moules, filets de poisson, légumes de saison, sauces vierges et herbes fraîches — pour deux personnes.', 25000],
  ['À partager', 'L’assiette de tapas', 'Brochettes, beignets, croustillants et mise en bouche du chef — pour la table.', 12000],
  ['Douceurs · Glaces', 'Coupe 2 boules', '', 2000],
  ['Douceurs · Glaces', 'Coupe 3 boules', '', 3000],
  ['Douceurs · Glaces', 'Coupe Coco Garden, glace & fruits frais', '', 3500],
  ['Douceurs · Fruits frais', 'Salade de fruits de saison', '', 2500],
  ['Douceurs · Fruits frais', 'Ananas frais du marché', '', 1500],
  ['Douceurs · Fruits frais', 'Assiette de fruits à partager', '', 4000],
  ['Douceurs · Dessert du jour', 'À l’inspiration du chef', 'Demandez la suggestion du jour à votre serveur.', 2500],
  ['Petit-déjeuner · Formules', 'Le Continental', '1 boisson chaude au choix (café, thé ou chocolat), 1 jus de fruit frais, 2 mini viennoiseries (croissant et pain au chocolat), beurre et confiture maison', 3000],
  ['Petit-déjeuner · Formules', 'Le Coco Express', '1 boisson chaude au choix, 1 jus de fruit frais, 1 croissant ou 2 tranches de pain grillé, beurre et confiture maison', 3500],
  ['Petit-déjeuner · Formules', 'Le Plaisir', '1 boisson chaude au choix, 1 jus de fruit frais, assiette de fruits frais de saison, 2 mini viennoiseries, yaourt nature ou aromatisé, granola maison', 4500],
  ['Petit-déjeuner · Formules', 'Le Garden', '1 boisson chaude au choix, 1 jus de fruit frais, assiette de fruits frais de saison, 2 œufs au choix, 2 tranches de pain grillé, beurre, confiture maison, fromage doux et jambon de dinde', 5500],
  ['Petit-déjeuner · À la carte', 'Croissant', '', 800],
  ['Petit-déjeuner · À la carte', 'Pain au chocolat', '', 900],
  ['Petit-déjeuner · À la carte', 'Pain grillé (2 tranches)', '', 700],
  ['Petit-déjeuner · À la carte', 'Omelette simple', '', 1500],
  ['Petit-déjeuner · À la carte', 'Omelette composée', 'Jambon, fromage, tomate, oignon', 2000],
  ['Petit-déjeuner · À la carte', 'Œufs au choix', 'Brouillés, au plat ou omelette', 1500],
  ['Petit-déjeuner · À la carte', 'Haricots rouges', '', 1500],
  ['Petit-déjeuner · À la carte', 'Saucisses (2 pièces)', '', 1500],
  ['Petit-déjeuner · À la carte', 'Yaourt nature ou aromatisé', '', 1000],
  ['Petit-déjeuner · À la carte', 'Assiette de fruits frais', '', 1500],
  ['Petit-déjeuner · À la carte', 'Fromage doux', '', 1000],
  ['Petit-déjeuner · À la carte', 'Jambon de dinde', '', 1000],
  ['Petit-déjeuner · À la carte', 'Granola maison', '', 1000],
  ['Petit-déjeuner · Boissons', 'Café expresso', '', 800],
  ['Petit-déjeuner · Boissons', 'Café allongé', '', 800],
  ['Petit-déjeuner · Boissons', 'Café au lait', '', 1000],
  ['Petit-déjeuner · Boissons', 'Thé / Infusion', '', 800],
  ['Petit-déjeuner · Boissons', 'Chocolat chaud', '', 1200],
  ['Petit-déjeuner · Boissons', 'Jus de fruit frais', 'Ananas, orange, papaye, mangue, citron', 1500],
];

async function main() {
  loadLocalEnv();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection('menuitems');
  let inserted = 0;
  for (const [index, [category, name, description, price, variants = []]] of items.entries()) {
    const result = await collection.updateOne(
      { restaurantId, name },
      { $setOnInsert: { restaurantId, category, name, description, price, variants: variants.map(([label, variantPrice]) => ({ label, price: variantPrice })), active: true, sortOrder: index, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount) inserted += 1;
  }
  const existingItems = await collection.find({ restaurantId }).sort({ createdAt: 1, _id: 1 }).toArray();
  let sequence = 0;
  for (const item of existingItems) {
    if (!item.itemCode) {
      sequence += 1;
      await collection.updateOne({ _id: item._id }, { $set: { itemCode: `PLT-${String(sequence).padStart(5, '0')}` } });
    } else {
      sequence = Math.max(sequence, Number(String(item.itemCode).replace('PLT-', '')) || 0);
    }
  }
  await mongoose.connection.collection('menucounters').updateOne({ _id: restaurantId }, { $max: { sequence } }, { upsert: true });
  await collection.updateOne({ restaurantId, category: 'Accompagnements', name: 'Riz, plantain, frites ou manioc' }, { $set: { price: 1000 } });
  console.log(`${inserted} éléments de carte ajoutés pour ${restaurantId}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
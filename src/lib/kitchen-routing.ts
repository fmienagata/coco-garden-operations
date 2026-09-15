/**
 * Routage des lignes vers les postes de préparation, et rendu du bon.
 *
 * Tout ce qui décide est pur : quelles lignes vont où, et à quoi ressemble le bon une fois
 * mis en page. L'encodage ESC/POS et l'envoi sur le réseau vivent dans l'agent, hors de
 * l'application. C'est ce qui permet de vérifier le contenu d'un bon sans imprimante.
 */

export type StationRoute = {
  id: string;
  name: string;
  destination: 'ecran' | 'imprimante' | 'les_deux';
  categories: string[];
  isDefault: boolean;
  printerWidth: number;
};

export type RoutedItem = {
  name: string;
  itemCode?: string;
  qty: number;
  price: number;
  category?: string;
  variant?: string;
};
export type TicketLine = { text: string; style: 'titre' | 'entete' | 'article' | 'detail' | 'note' | 'trait' };

/**
 * Répartit les lignes d'une commande entre les postes.
 *
 * Une catégorie non adressée tombe sur le poste par défaut : sans ce filet, un plat ajouté
 * à la carte sans qu'on pense au routage disparaîtrait silencieusement de la cuisine.
 * Un poste sans ligne ne reçoit pas de bon vide.
 */
export function routeItems(items: RoutedItem[], stations: StationRoute[]) {
  const active = stations.filter((station) => !station.isDefault);
  const fallback = stations.find((station) => station.isDefault) || null;
  const byStation = new Map<string, { station: StationRoute; items: RoutedItem[] }>();

  for (const item of items) {
    const match = active.find((station) => item.category && station.categories.includes(item.category)) || fallback;
    if (!match) continue;
    const bucket = byStation.get(match.id) || { station: match, items: [] };
    bucket.items.push(item);
    byStation.set(match.id, bucket);
  }

  return [...byStation.values()];
}

function wrap(text: string, width: number, indent = '') {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = indent + word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export type TicketSource = {
  orderNumber: string;
  fulfillmentType: string;
  tableNumber?: number;
  covers?: number;
  customerName?: string;
  diningNotes?: string;
  deliveryAddress?: string;
  createdByLabel?: string;
  producedAt: Date;
};

/**
 * Met en page le bon d'un poste.
 *
 * Le contenu est pensé pour un cuisinier debout devant une imprimante : le poste et la
 * table en premier, les quantités avant les noms, aucun prix. Un prix sur un bon de
 * préparation n'aide personne et allonge le papier.
 */
export function renderTicket(source: TicketSource, station: StationRoute, items: RoutedItem[]): TicketLine[] {
  const width = station.printerWidth || 42;
  const lines: TicketLine[] = [];
  const at = source.producedAt;
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  lines.push({ text: station.name.toUpperCase(), style: 'titre' });

  const where =
    source.fulfillmentType === 'dine_in'
      ? `TABLE ${source.tableNumber ?? '?'}${source.covers ? ` · ${source.covers} couverts` : ''}`
      : source.fulfillmentType === 'delivery'
        ? 'LIVRAISON'
        : 'A EMPORTER';
  lines.push({ text: where, style: 'entete' });
  lines.push({ text: `${source.orderNumber} · ${clock}`, style: 'entete' });
  if (source.createdByLabel) lines.push({ text: source.createdByLabel, style: 'detail' });
  lines.push({ text: '-'.repeat(width), style: 'trait' });

  for (const item of items) {
    const prefix = `${item.qty}x `;
    const wrapped = wrap(item.name, width - prefix.length, ' '.repeat(prefix.length));
    lines.push({ text: prefix + wrapped[0], style: 'article' });
    for (const extra of wrapped.slice(1))
      lines.push({ text: ' '.repeat(prefix.length) + extra.trim(), style: 'article' });
  }

  const notes = source.diningNotes?.trim();
  if (notes) {
    lines.push({ text: '-'.repeat(width), style: 'trait' });
    for (const line of wrap(`CONSIGNES: ${notes}`, width)) lines.push({ text: line, style: 'note' });
  }

  if (source.fulfillmentType === 'delivery' && source.deliveryAddress) {
    lines.push({ text: '-'.repeat(width), style: 'trait' });
    for (const line of wrap(source.deliveryAddress, width)) lines.push({ text: line, style: 'detail' });
  }

  return lines;
}

/** Identifiant déterministe : un bon par commande et par poste, quel que soit le nombre de rejeux. */
export function printJobId(restaurantId: string, orderId: string, stationId: string) {
  return `${restaurantId}:${orderId}:${stationId}`;
}

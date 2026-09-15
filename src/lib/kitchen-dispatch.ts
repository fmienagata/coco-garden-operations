import PreparationStation from './models/PreparationStation';
import PrintJob from './models/PrintJob';
import MenuItem from './models/MenuItem';
import Order from './models/Order';
import { connectMongo } from './db/mongo';
import { routeItems, renderTicket, printJobId, type StationRoute, type RoutedItem } from './kitchen-routing';

export async function loadStations(restaurantId: string): Promise<StationRoute[]> {
  const stations = await PreparationStation.find({ restaurantId, active: true }).sort({ isDefault: 1, name: 1 }).lean() as any[];
  return stations.map((station) => ({
    id: String(station._id),
    name: station.name,
    destination: station.destination,
    categories: station.categories || [],
    isDefault: Boolean(station.isDefault),
    printerWidth: station.printerWidth || 42,
    printerHost: station.printerHost || '',
    printerPort: station.printerPort || 9100,
  })) as StationRoute[];
}

/**
 * Les lignes d'une commande ne portent pas leur catégorie : elle vit sur la carte.
 * On la rattache au moment du routage, à partir du code article.
 *
 * L'index est construit une seule fois par requête et passé aux appels : le relire pour
 * chaque commande d'une file rechargerait la carte entière des dizaines de fois.
 */
type CategoryIndex = { byCode: Map<string, string>; byName: Map<string, string> };

async function categoryIndex(restaurantId: string): Promise<CategoryIndex> {
  const menu = await MenuItem.find({ restaurantId }).select('itemCode category name').lean() as any[];
  return {
    byCode: new Map(menu.map((entry) => [entry.itemCode, entry.category])),
    byName: new Map(menu.map((entry) => [entry.name, entry.category])),
  };
}

function withCategories(items: any[], index: CategoryIndex): RoutedItem[] {
  return (items || []).map((item: any) => ({
    ...item,
    // Un plat renommé depuis la prise de commande reste retrouvé par son code.
    category: index.byCode.get(item.itemCode) || index.byName.get(item.name) || undefined,
  }));
}

/**
 * Envoie une commande confirmée aux postes de préparation.
 *
 * Les postes sur écran n'ont rien à recevoir : ils interrogent leur file. Seuls les postes
 * qui impriment produisent un bon, et ce bon porte un identifiant déterministe, donc un
 * rejeu après coupure n'imprime jamais le même plat deux fois.
 *
 * Un échec ici ne doit jamais annuler la confirmation : la commande est prise, et un bon
 * manquant se voit sur l'écran du poste. L'inverse — refuser une commande parce qu'une
 * imprimante est injoignable — arrêterait le service.
 */
export async function dispatchToKitchen(restaurantId: string, orderId: string) {
  try {
    await connectMongo();
    const order = await Order.findOne({ _id: orderId, restaurantId }).lean() as any;
    if (!order) return { created: 0 };

    const stations = await loadStations(restaurantId);
    if (stations.length === 0) return { created: 0 };

    const items = withCategories(order.items, await categoryIndex(restaurantId));
    const routed = routeItems(items, stations);
    const source = {
      orderNumber: order.orderNumber,
      fulfillmentType: order.fulfillmentType,
      tableNumber: order.tableNumber,
      covers: order.covers,
      customerName: order.customerName,
      diningNotes: order.diningNotes,
      deliveryAddress: order.deliveryAddress,
      createdByLabel: order.createdByLabel,
      producedAt: new Date(),
    };

    let created = 0;
    for (const entry of routed) {
      if (entry.station.destination === 'ecran') continue;
      const station = entry.station as StationRoute & { printerHost?: string; printerPort?: number };
      const job = {
        _id: printJobId(restaurantId, String(order._id), station.id),
        restaurantId,
        stationId: station.id,
        stationName: station.name,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        printerHost: station.printerHost || '',
        printerPort: station.printerPort || 9100,
        lines: renderTicket(source, entry.station, entry.items),
        status: 'pending',
      };
      // $setOnInsert : un bon déjà sorti ne se réécrit pas, même si la commande est rejouée.
      const result = await PrintJob.updateOne({ _id: job._id }, { $setOnInsert: job }, { upsert: true });
      if (result.upsertedCount) created += 1;
    }
    return { created };
  } catch (error) {
    console.error('KITCHEN_DISPATCH_FAILED', orderId, error);
    return { created: 0 };
  }
}

/**
 * File d'un poste sur écran : les commandes en préparation, réduites aux lignes du poste.
 *
 * Le bar n'a pas à lire les plats, et la cuisine n'a pas à lire les boissons — un écran
 * encombré se lit mal en plein service.
 */
export async function stationQueue(restaurantId: string, stationId: string) {
  await connectMongo();
  const stations = await loadStations(restaurantId);
  const station = stations.find((entry) => entry.id === stationId);
  if (!station) return null;

  const orders = await Order.find({
    restaurantId,
    status: { $in: ['confirmed', 'preparing', 'ready'] },
  }).sort({ createdAt: 1 }).limit(100).lean() as any[];

  // Un seul chargement de la carte pour toute la file, quelle que soit sa longueur.
  const index = await categoryIndex(restaurantId);
  const queue = [];
  for (const order of orders) {
    const items = withCategories(order.items, index);
    const routed = routeItems(items, stations).find((entry) => entry.station.id === stationId);
    if (!routed) continue;
    queue.push({ ...order, items: routed.items });
  }
  return { station: { id: station.id, name: station.name, destination: station.destination }, orders: queue };
}

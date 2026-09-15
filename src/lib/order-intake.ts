import Order from './models/Order';
import MenuItem from './models/MenuItem';
import DeliveryZone from './models/DeliveryZone';
import { connectMongo } from './db/mongo';
import { getNextOrderNumber } from './orders';
import { UserError } from './api';

export type IntakeActor = {
  restaurantId: string;
  createdBy: string;
  createdByType: 'management' | 'whatsapp_agent';
  createdByLabel: string;
};

/**
 * Prise de commande à emporter ou en livraison.
 *
 * Extrait de la route pour être partagé avec la reprise hors ligne : le même chemin
 * de validation et de tarification sert qu'une commande arrive en direct ou soit rejouée
 * après une coupure. Les prix sont toujours relus de la carte active, jamais reçus du poste.
 */
export async function createIntakeOrder(
  actor: IntakeActor,
  payload: Record<string, any>,
  options: { orderNumber?: string; requestKey?: string } = {},
) {
  const { restaurantId } = actor;
  const {
    items,
    fulfillmentType = 'takeaway',
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryNotes,
    driverPhone,
    deliveryZoneId,
  } = payload;

  const hasDeliveryDetails =
    typeof customerPhone === 'string' &&
    customerPhone.trim().length >= 8 &&
    typeof deliveryAddress === 'string' &&
    deliveryAddress.trim().length >= 5;
  if (
    (fulfillmentType === 'delivery' &&
      (!hasDeliveryDetails || typeof deliveryZoneId !== 'string' || !deliveryZoneId.trim())) ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !['delivery', 'takeaway'].includes(fulfillmentType)
  ) {
    throw new UserError('Invalid payload');
  }

  await connectMongo();

  // Rejeu d'une opération déjà appliquée : on rend la commande existante plutôt qu'un doublon.
  if (options.requestKey) {
    const existing = await Order.findOne({ restaurantId, requestKey: options.requestKey }).lean();
    if (existing) return { order: existing as Record<string, unknown>, created: false };
  }

  const menuItems = await MenuItem.find({ restaurantId, active: true }).lean();
  const normalizedItems = items.map((item: any) => {
    const menuItem = menuItems.find(
      (candidate: any) =>
        (item.itemCode && candidate.itemCode === item.itemCode) || (!item.itemCode && candidate.name === item.name),
    );
    if (!menuItem || !Number.isInteger(item.qty) || item.qty <= 0) return null;
    return { name: menuItem.name, itemCode: menuItem.itemCode, qty: item.qty, price: menuItem.price };
  });
  if (normalizedItems.some((item) => !item))
    throw new UserError('Each item must match an available menu item and have a positive quantity');
  const validItems = normalizedItems as { name: string; itemCode: string; qty: number; price: number }[];

  const zone =
    fulfillmentType === 'delivery'
      ? ((await DeliveryZone.findOne({ restaurantId, _id: deliveryZoneId, active: true }).lean()) as {
          _id: unknown;
          name: string;
          fee: number;
        } | null)
      : null;
  if (fulfillmentType === 'delivery' && !zone) throw new UserError('Choisissez une zone de livraison active');

  const deliveryFee = zone?.fee || 0;
  const total = validItems.reduce((sum, item) => sum + item.price * item.qty, 0) + deliveryFee;
  const orderNumber = options.orderNumber || (await getNextOrderNumber(restaurantId));

  const order = await Order.create({
    restaurantId,
    orderNumber,
    createdBy: actor.createdBy,
    createdByType: actor.createdByType,
    createdByLabel: actor.createdByLabel,
    fulfillmentType,
    items: validItems,
    total,
    deliveryFee,
    deliveryZoneId: zone ? String(zone._id) : undefined,
    deliveryZoneName: zone?.name,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryNotes,
    driverPhone,
    requestKey: options.requestKey,
  });
  return { order: order.toObject() as Record<string, unknown>, created: true };
}

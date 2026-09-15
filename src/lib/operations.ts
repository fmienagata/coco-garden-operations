import mongoose from 'mongoose';
import Operation from './models/Operation';
import Order from './models/Order';
import DiningTable from './models/DiningTable';
import { connectMongo } from './db/mongo';
import { UserError, type ApiSession } from './api';
import { assertNumberIsLeased } from './numbering';
import { createIntakeOrder } from './order-intake';
import { priceItems, details } from './dining';
import type { DeviceIdentity } from './devices';
import { dispatchToKitchen } from './kitchen-dispatch';

export const MAX_BATCH = 200;
const OP_ID = /^[A-Za-z0-9_-]{16,64}$/;

// Un ticket clos ne se rejoue jamais. Une opération produite avant la coupure et qui
// arrive après l'encaissement doit être refusée franchement, pas appliquée en silence.
const TERMINAL = ['completed', 'cancelled'];

export type OperationContext = { device: DeviceIdentity; session: ApiSession };
type Handler = (
  context: OperationContext,
  payload: Record<string, any>,
  opId: string,
) => Promise<{ resultId: string; resultNumber?: string }>;

async function loadOrder(restaurantId: string, id: unknown) {
  if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant de commande invalide.');
  const order = (await Order.findOne({ _id: id, restaurantId }).lean()) as any;
  if (!order) throw new UserError('Commande introuvable.', 404);
  return order;
}

const preparation: Record<string, string> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready' };

const handlers: Record<string, Handler> = {
  // Prise de commande à emporter ou en livraison, produite hors ligne.
  'order.create': async ({ device, session }, payload, opId) => {
    const orderNumber = await assertNumberIsLeased(session.restaurantId, device, payload.orderNumber);
    const { order } = await createIntakeOrder(
      {
        restaurantId: session.restaurantId,
        createdBy: session.login,
        createdByType: 'management',
        createdByLabel: `${device.name} · ${session.login}`,
        // Le numéro issu du bail sert aussi de clé d'idempotence métier.
      },
      payload,
      { orderNumber, requestKey: `op-${opId}` },
    );
    return { resultId: String(order._id), resultNumber: String(order.orderNumber) };
  },

  // Progression de préparation en cuisine.
  'order.advance': async ({ session }, payload) => {
    const order = await loadOrder(session.restaurantId, payload.orderId);
    if (TERMINAL.includes(order.status)) throw new UserError('Cette commande est clôturée.', 409);
    const allowed = preparation[order.status];
    if (!allowed || payload.status !== allowed)
      throw new UserError(`Transition impossible : la commande est déjà « ${order.status} ».`, 409);
    const changed = (await Order.findOneAndUpdate(
      { _id: order._id, restaurantId: session.restaurantId, status: order.status, __v: order.__v },
      { $set: { status: allowed }, $inc: { __v: 1 } },
      { new: true },
    ).lean()) as any;
    if (!changed) throw new UserError('Commande modifiée entre-temps.', 409);
    // Une confirmation rejouée après coupure produit le bon : l'identifiant déterministe
    // du bon empêche qu'un second rejeu le fasse sortir une deuxième fois.
    if (allowed === 'confirmed') await dispatchToKitchen(session.restaurantId, String(changed._id));
    return { resultId: String(changed._id), resultNumber: String(changed.orderNumber) };
  },

  // Ouverture d'un ticket de salle sur une table.
  'salle.ticket.create': async ({ device, session }, payload, opId) => {
    const orderNumber = await assertNumberIsLeased(session.restaurantId, device, payload.orderNumber);
    const requestKey = `op-${opId}`;
    const existing = (await Order.findOne({ restaurantId: session.restaurantId, requestKey }).lean()) as any;
    if (existing) return { resultId: String(existing._id), resultNumber: String(existing.orderNumber) };
    const table = await DiningTable.findOne({
      _id: mongoose.isValidObjectId(payload.tableId) ? payload.tableId : null,
      restaurantId: session.restaurantId,
      active: true,
    });
    if (!table) throw new UserError('Table indisponible.', 404);
    const info = details(payload);
    if (info.covers > table.capacity) throw new UserError('Le nombre de couverts dépasse la capacité de la table.');
    const items = await priceItems(session.restaurantId, payload.items);
    const order = await Order.create({
      restaurantId: session.restaurantId,
      orderNumber,
      createdBy: session.login,
      createdByType: 'management',
      createdByLabel: `${device.name} · ${session.login}`,
      fulfillmentType: 'dine_in',
      diningTableId: String(table._id),
      tableNumber: table.number,
      ...info,
      items,
      total: items.reduce((sum: number, line: any) => sum + line.price * line.qty, 0),
      status: 'draft',
      requestKey,
    });
    return { resultId: String(order._id), resultNumber: String(order.orderNumber) };
  },

  // Envoi du ticket en cuisine.
  'salle.ticket.send': async ({ session }, payload) => {
    const order = await loadOrder(session.restaurantId, payload.orderId);
    if (order.fulfillmentType !== 'dine_in') throw new UserError('Ce ticket n’appartient pas à la salle.', 409);
    if (order.status !== 'draft') throw new UserError('Ticket déjà envoyé.', 409);
    const changed = (await Order.findOneAndUpdate(
      { _id: order._id, restaurantId: session.restaurantId, status: 'draft', __v: order.__v },
      { $set: { status: 'confirmed' }, $inc: { __v: 1 } },
      { new: true },
    ).lean()) as any;
    if (!changed) throw new UserError('Ticket modifié entre-temps.', 409);
    await dispatchToKitchen(session.restaurantId, String(changed._id));
    return { resultId: String(changed._id), resultNumber: String(changed.orderNumber) };
  },

  // Confirmation du service en salle.
  'salle.ticket.serve': async ({ session }, payload) => {
    const order = await loadOrder(session.restaurantId, payload.orderId);
    if (order.fulfillmentType !== 'dine_in') throw new UserError('Ce ticket n’appartient pas à la salle.', 409);
    if (TERMINAL.includes(order.status)) throw new UserError('Ce ticket est clôturé.', 409);
    if (order.status !== 'ready') throw new UserError('La cuisine doit terminer la préparation.', 409);
    const changed = (await Order.findOneAndUpdate(
      { _id: order._id, restaurantId: session.restaurantId, status: 'ready', __v: order.__v },
      { $set: { status: 'served', servedAt: new Date() }, $inc: { __v: 1 } },
      { new: true },
    ).lean()) as any;
    if (!changed) throw new UserError('Ticket modifié entre-temps.', 409);
    return { resultId: String(changed._id), resultNumber: String(changed.orderNumber) };
  },
};

export const OPERATION_TYPES = Object.keys(handlers);

/**
 * Applique un lot d'opérations produites par un poste, dans l'ordre et une seule fois.
 *
 * Trois propriétés tiennent l'ensemble :
 *
 * 1. L'identifiant d'opération est déterministe côté serveur, donc un rejeu rend le
 *    résultat déjà enregistré au lieu de dupliquer la commande.
 * 2. Un refus est enregistré comme tel. Un poste qui rejoue une opération devenue
 *    impossible reçoit le même refus, et cesse de la réémettre.
 * 3. Une opération en échec n'interrompt pas le lot : chacune répond pour elle-même,
 *    sans quoi une seule opération empoisonnée bloquerait toute la reprise du poste.
 */
export async function applyOperations(context: OperationContext, operations: unknown) {
  if (!Array.isArray(operations)) throw new UserError('Le lot d’opérations est invalide.');
  if (operations.length === 0) throw new UserError('Aucune opération à appliquer.');
  if (operations.length > MAX_BATCH) throw new UserError(`Lot trop volumineux (${MAX_BATCH} opérations au maximum).`);

  await connectMongo();
  const results = [];

  for (const raw of operations) {
    const operation = raw as Record<string, any>;
    const opId = operation?.opId;
    if (typeof opId !== 'string' || !OP_ID.test(opId)) {
      results.push({
        opId: typeof opId === 'string' ? opId : null,
        status: 'rejected',
        error: 'Identifiant d’opération invalide.',
      });
      continue;
    }

    const recordId = `${context.session.restaurantId}:${opId}`;
    const known = (await Operation.findById(recordId).lean()) as any;
    if (known) {
      results.push({
        opId,
        status: known.status === 'applied' ? 'duplicate' : 'rejected',
        resultId: known.resultId,
        resultNumber: known.resultNumber,
        error: known.error,
      });
      continue;
    }

    const handler = handlers[operation.type];
    const producedAt =
      typeof operation.producedAt === 'string' && Number.isFinite(Date.parse(operation.producedAt))
        ? new Date(operation.producedAt)
        : null;
    const base = {
      _id: recordId,
      restaurantId: context.session.restaurantId,
      deviceId: context.device.id,
      actor: context.session.login,
      opId,
      type: typeof operation.type === 'string' ? operation.type.slice(0, 60) : 'inconnu',
      producedAt,
      appliedAt: new Date(),
    };

    if (!handler) {
      await Operation.create({ ...base, status: 'rejected', error: 'Type d’opération inconnu.' }).catch(() => {});
      results.push({ opId, status: 'rejected', error: 'Type d’opération inconnu.' });
      continue;
    }

    try {
      const outcome = await handler(context, (operation.payload || {}) as Record<string, any>, opId);
      await Operation.create({
        ...base,
        status: 'applied',
        resultId: outcome.resultId,
        resultNumber: outcome.resultNumber || null,
      });
      results.push({ opId, status: 'applied', resultId: outcome.resultId, resultNumber: outcome.resultNumber });
    } catch (error: any) {
      // Une panne d'infrastructure doit pouvoir être retentée ; une règle métier violée, non.
      const isBusinessRule = error instanceof UserError && error.status !== 503;
      if (!isBusinessRule) {
        console.error('SYNC_OPERATION_FAILED', operation.type, error);
        results.push({ opId, status: 'retry', error: 'Indisponible. Le poste peut réessayer.' });
        continue;
      }
      const message = error.message;
      await Operation.create({ ...base, status: 'rejected', error: message }).catch(() => {});
      results.push({ opId, status: 'rejected', error: message });
    }
  }

  return results;
}

/**
 * Logique de la file hors ligne, sans aucune dépendance au navigateur.
 *
 * Tout ce qui décide — quel numéro consommer, quelle opération reste à rejouer, ce que
 * l'écran doit afficher tant que la reprise n'a pas eu lieu — vit ici et se teste en Node.
 * IndexedDB et le service worker ne sont que des supports de stockage autour.
 */

export type Lease = { prefix: string; start: number; end: number; next: number };

export type PendingOperation = {
  opId: string;
  type: string;
  payload: Record<string, any>;
  producedAt: string;
  attempts: number;
  lastError?: string | null;
};

export type SyncResult = {
  opId: string | null;
  status: 'applied' | 'duplicate' | 'rejected' | 'retry';
  resultId?: string;
  resultNumber?: string;
  error?: string | null;
};

export function formatLeasedNumber(prefix: string, sequence: number) {
  return `CMD-${prefix}-${String(sequence).padStart(5, '0')}`;
}

export function remainingNumbers(leases: Lease[]) {
  return leases.reduce((total, lease) => total + Math.max(0, lease.end - lease.next + 1), 0);
}

/**
 * Consomme le prochain numéro disponible.
 *
 * Rend une nouvelle liste plutôt que de modifier l'ancienne : l'appelant écrit le curseur
 * avant d'utiliser le numéro, afin qu'une coupure de courant au mauvais moment fasse perdre
 * un numéro plutôt que d'en attribuer deux fois le même.
 */
export function takeNumber(leases: Lease[]): { number: string; leases: Lease[] } | null {
  const index = leases.findIndex((lease) => lease.next <= lease.end);
  if (index === -1) return null;
  const lease = leases[index];
  const next = leases.map((item, position) => (position === index ? { ...item, next: item.next + 1 } : item));
  return { number: formatLeasedNumber(lease.prefix, lease.next), leases: next };
}

/** Une réserve basse doit être reconstituée pendant que le réseau est encore là. */
export function needsLease(leases: Lease[], threshold = 20) {
  return remainingNumbers(leases) < threshold;
}

/**
 * Confronte la file locale à ce que le serveur a répondu.
 *
 * `applied`, `duplicate` et `rejected` sont définitifs : l'opération quitte la file, y compris
 * lorsqu'elle est refusée. Une opération refusée qu'on garderait serait rejouée sans fin.
 * Seul `retry`, qui signale une indisponibilité et non une règle violée, reste en attente.
 */
export function reconcile(pending: PendingOperation[], results: SyncResult[]) {
  const byId = new Map(results.filter((result) => result.opId).map((result) => [result.opId as string, result]));
  const remaining: PendingOperation[] = [];
  const settled: { operation: PendingOperation; result: SyncResult }[] = [];

  for (const operation of pending) {
    const result = byId.get(operation.opId);
    if (!result) {
      // Sans réponse pour cette opération, on ne présume rien : elle reste à rejouer.
      remaining.push(operation);
      continue;
    }
    if (result.status === 'retry') {
      remaining.push({ ...operation, attempts: operation.attempts + 1, lastError: result.error || null });
      continue;
    }
    settled.push({ operation, result });
  }

  return {
    remaining,
    settled,
    applied: settled.filter((item) => item.result.status === 'applied').length,
    duplicates: settled.filter((item) => item.result.status === 'duplicate').length,
    rejected: settled.filter((item) => item.result.status === 'rejected'),
  };
}

export type OrderView = Record<string, any> & { _id: string; orderNumber: string; status: string };

/**
 * Vue que l'écran doit montrer tant que la file n'est pas remontée.
 *
 * Un serveur qui vient d'envoyer un ticket doit le voir parti, même sans réseau. Les entrées
 * encore en file sont marquées `pending: true` pour que l'interface puisse le dire clairement
 * plutôt que de laisser croire que le serveur a déjà pris la commande.
 */
export function mergePending(serverOrders: OrderView[], pending: PendingOperation[]): OrderView[] {
  const byId = new Map(serverOrders.map((order) => [String(order._id), { ...order }]));
  const created: OrderView[] = [];

  for (const operation of pending) {
    if (operation.type === 'order.create' || operation.type === 'salle.ticket.create') {
      created.push({
        _id: `pending:${operation.opId}`,
        orderNumber: operation.payload.orderNumber,
        status: operation.type === 'salle.ticket.create' ? 'draft' : 'pending',
        fulfillmentType:
          operation.type === 'salle.ticket.create' ? 'dine_in' : operation.payload.fulfillmentType || 'takeaway',
        items: operation.payload.items || [],
        total: 0,
        createdAt: operation.producedAt,
        pending: true,
      });
      continue;
    }
    const target = byId.get(String(operation.payload.orderId));
    if (!target) continue;
    if (operation.type === 'order.advance') target.status = operation.payload.status;
    if (operation.type === 'salle.ticket.send') target.status = 'confirmed';
    if (operation.type === 'salle.ticket.serve') target.status = 'served';
    target.pending = true;
  }

  return [...created, ...byId.values()];
}

/** Identifiant d'opération : aléatoire, et conforme à ce que la reprise accepte. */
export function newOperationId(randomBytes: (size: number) => Uint8Array) {
  return Array.from(randomBytes(13))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

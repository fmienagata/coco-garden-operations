import { withAudit } from '../../../lib/audit';
import Operation from '../../../lib/models/Operation';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, readJson, apiResponse } from '../../../lib/api';
import { requireDevice } from '../../../lib/devices';
import { applyOperations, MAX_BATCH, OPERATION_TYPES } from '../../../lib/operations';

/**
 * Reprise d'un poste après une coupure.
 *
 * Le poste rejoue les gestes métier qu'il a produits hors ligne, pas l'état final :
 * c'est ce qui permet au serveur d'arbitrer les conflits avec ce qui s'est passé
 * ailleurs pendant la coupure, plutôt que d'écraser aveuglément.
 *
 * Le lot répond toujours 200 : chaque opération porte son propre sort. Un refus isolé
 * ne doit pas bloquer la reprise des suivantes.
 */
async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    const session = await requireSession();
    if (session.restaurantId !== device.restaurantId) {
      return Response.json({ error: 'Ce poste appartient à un autre établissement.' }, { status: 403 });
    }
    const body = await readJson(request);
    const results = await applyOperations({ device, session }, body.operations);
    return Response.json(
      {
        device: device.numberPrefix,
        applied: results.filter((item) => item.status === 'applied').length,
        duplicates: results.filter((item) => item.status === 'duplicate').length,
        rejected: results.filter((item) => item.status === 'rejected').length,
        retry: results.filter((item) => item.status === 'retry').length,
        results,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}

// Permet au poste de savoir ce que le serveur a déjà enregistré de sa part,
// pour repartir proprement après une réinstallation.
async function handleGET(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    await connectMongo();
    const applied = await Operation.find({ restaurantId: device.restaurantId, deviceId: device.id })
      .sort({ appliedAt: -1 })
      .limit(100)
      .select('opId type status resultId resultNumber error appliedAt')
      .lean();
    return Response.json(
      { maxBatch: MAX_BATCH, types: OPERATION_TYPES, operations: applied },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}

export const GET = withAudit('GET /api/sync', handleGET);
export const POST = withAudit('POST /api/sync', handlePOST);

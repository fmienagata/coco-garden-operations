import { withAudit } from '../../../lib/audit';
import NumberLease from '../../../lib/models/NumberLease';
import { connectMongo } from '../../../lib/db/mongo';
import { readJson, apiResponse } from '../../../lib/api';
import { requireDevice } from '../../../lib/devices';
import { allocateLease, DEFAULT_LEASE_SIZE, formatLeasedNumber } from '../../../lib/numbering';

// Le bail appartient au poste, pas à la personne : un appareil doit pouvoir constituer
// sa réserve de numéros au démarrage, avant même qu'un serveur ait pris son poste.
async function handleGET(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    await connectMongo();
    const leases = await NumberLease.find({ restaurantId: device.restaurantId, deviceId: device.id })
      .sort({ start: -1 }).limit(20).select('prefix start end expiresAt createdAt').lean() as any[];
    return Response.json({
      device: { name: device.name, kind: device.kind, numberPrefix: device.numberPrefix },
      leases: leases.map((lease) => ({
        ...lease,
        firstNumber: formatLeasedNumber(lease.prefix, lease.start),
        lastNumber: formatLeasedNumber(lease.prefix, lease.end),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

async function handlePOST(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    // Un poste peut demander sa réserve sans corps de requête : la taille par défaut suffit.
    const body: Record<string, any> = await readJson(request).catch(() => ({}));
    const size = body.size === undefined ? DEFAULT_LEASE_SIZE : body.size;
    return Response.json(await allocateLease(device.restaurantId, device, size), { status: 201 });
  });
}

export const GET = withAudit("GET /api/number-leases", handleGET);
export const POST = withAudit("POST /api/number-leases", handlePOST);

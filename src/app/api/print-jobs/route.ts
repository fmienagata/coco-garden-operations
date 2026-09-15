import { withAudit } from '../../../lib/audit';
import PrintJob from '../../../lib/models/PrintJob';
import { connectMongo } from '../../../lib/db/mongo';
import { apiResponse } from '../../../lib/api';
import { requireDevice } from '../../../lib/devices';

// Un agent qui meurt entre la réclamation et l'impression ne doit pas bloquer le bon :
// au-delà de ce délai, il repart dans la file pour un autre agent.
const STALE_MS = 90 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * L'agent d'impression réclame les bons de son établissement.
 *
 * La réclamation est atomique, un bon à la fois : deux agents branchés par erreur sur la
 * même imprimante ne peuvent pas sortir le même bon en double, ce qui ferait préparer le
 * plat deux fois.
 */
async function handleGET(request: Request) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    await connectMongo();

    const claimed = [];
    const stale = new Date(Date.now() - STALE_MS);
    for (let taken = 0; taken < 20; taken += 1) {
      const job = await PrintJob.findOneAndUpdate(
        {
          restaurantId: device.restaurantId,
          attempts: { $lt: MAX_ATTEMPTS },
          $or: [{ status: 'pending' }, { status: 'claimed', claimedAt: { $lt: stale } }],
        },
        { $set: { status: 'claimed', claimedBy: device.id, claimedAt: new Date() }, $inc: { attempts: 1 } },
        { new: true, sort: { createdAt: 1 } },
      ).lean();
      if (!job) break;
      claimed.push(job);
    }

    return Response.json({ jobs: claimed }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export const GET = withAudit("GET /api/print-jobs", handleGET);

import { withAudit } from '../../../../lib/audit';
import PrintJob from '../../../../lib/models/PrintJob';
import { connectMongo } from '../../../../lib/db/mongo';
import { readJson, apiResponse, UserError } from '../../../../lib/api';
import { requireDevice } from '../../../../lib/devices';

/**
 * L'agent rend compte d'un bon : sorti, ou en échec.
 *
 * Un échec repasse le bon en attente pour qu'un autre essai le reprenne. Après cinq essais
 * il reste en échec plutôt que de tourner en boucle : une imprimante débranchée doit se
 * voir, pas saturer la file en silence.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const device = await requireDevice(request);
    const { id } = await params;
    const body = await readJson(request);
    if (!['printed', 'failed'].includes(body.result)) throw new UserError('Résultat invalide.');

    await connectMongo();
    const changes =
      body.result === 'printed'
        ? { status: 'printed', printedAt: new Date(), lastError: null }
        : {
            status: 'pending',
            lastError: typeof body.error === 'string' ? body.error.slice(0, 300) : 'Impression impossible.',
          };

    const job = (await PrintJob.findOneAndUpdate(
      { _id: id, restaurantId: device.restaurantId, status: 'claimed', claimedBy: device.id },
      { $set: changes },
      { new: true },
    ).lean()) as any;
    if (!job) throw new UserError('Bon introuvable ou réclamé par un autre poste.', 409);

    if (body.result === 'failed' && job.attempts >= 5) {
      await PrintJob.updateOne({ _id: id }, { $set: { status: 'failed' } });
    }
    return Response.json({ success: true, status: job.status });
  });
}

export const POST = withAudit('POST /api/print-jobs/[id]', handlePOST);

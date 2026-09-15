import { withAudit } from '../../../../../lib/audit';
import mongoose from 'mongoose';
import { requireSession, apiResponse, UserError } from '../../../../../lib/api';
import { stationQueue } from '../../../../../lib/kitchen-dispatch';

// File d'un poste sur écran : les commandes en cours, réduites aux lignes de ce poste.
async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'cuisine' });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    const queue = await stationQueue(session.restaurantId, id);
    if (!queue) throw new UserError('Poste introuvable.', 404);
    return Response.json(queue, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export const GET = withAudit("GET /api/stations/[id]/queue", handleGET);

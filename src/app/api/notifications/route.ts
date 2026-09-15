import { withAudit } from '../../../lib/audit';
import Notification from '../../../lib/models/Notification';
import { connectMongo } from '../../../lib/db/mongo';
import { requireSession, apiResponse } from '../../../lib/api';

async function handleGET() {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'notifications' });
    await connectMongo();
    return Response.json(
      await Notification.find({ restaurantId: session.restaurantId }).sort({ createdAt: -1 }).limit(200).lean(),
    );
  });
}

export const GET = withAudit('GET /api/notifications', handleGET);

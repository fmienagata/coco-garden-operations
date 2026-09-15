import { withAudit } from '../../../../../lib/audit';
import mongoose from 'mongoose';
import Notification from '../../../../../lib/models/Notification';
import { connectMongo } from '../../../../../lib/db/mongo';
import { requireSession, apiResponse, UserError } from '../../../../../lib/api';

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const session = await requireSession({ module: 'notifications' });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant invalide.');
    await connectMongo();
    const notification = (await Notification.findOneAndUpdate(
      { _id: id, restaurantId: session.restaurantId },
      { $inc: { attempts: 1 }, $set: { status: 'pending', error: '' } },
      { new: true },
    ).lean()) as { recipientPhone: string; message: string } | null;
    if (!notification) throw new UserError('Notification not found', 404);
    return Response.json({
      whatsappUrl: `https://wa.me/${notification.recipientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(notification.message)}`,
    });
  });
}

export const POST = withAudit('POST /api/notifications/[id]/retry', handlePOST);

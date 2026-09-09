import { withAudit } from '../../../../../lib/audit';
import { cookies } from 'next/headers';
import Notification from '../../../../../lib/models/Notification';
import { connectMongo } from '../../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../../lib/auth";
import { getSession } from "../../../../../lib/server-session";

async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const { id } = await params;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, restaurantId: session.restaurantId },
    { $inc: { attempts: 1 }, $set: { status: 'pending', error: '' } },
    { new: true },
  ).lean() as { recipientPhone: string; message: string } | null;
  if (!notification) return Response.json({ error: 'Notification not found' }, { status: 404 });
  return Response.json({ whatsappUrl: `https://wa.me/${notification.recipientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(notification.message)}` });
}

export const POST = withAudit("POST /api/notifications/[id]/retry", handlePOST);

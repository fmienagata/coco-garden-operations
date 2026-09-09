import { withAudit } from '../../../lib/audit';
import { cookies } from 'next/headers';
import Notification from '../../../lib/models/Notification';
import { connectMongo } from '../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../lib/auth";
import { getSession } from "../../../lib/server-session";

async function handleGET() {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await connectMongo();
  const notifications = await Notification.find({ restaurantId: session.restaurantId }).sort({ createdAt: -1 }).limit(200).lean();
  return Response.json(notifications);
}

export const GET = withAudit("GET /api/notifications", handleGET);

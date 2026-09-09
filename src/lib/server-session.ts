import { getSession as decodeSession, normalizeRole, DEFAULT_RESTAURANT_ID, isWhatsappAgentRequest as validAgentToken } from './auth';
import { connectMongo } from './db/mongo';
import User from './models/User';

export async function getSession(value?: string) {
  const session = decodeSession(value);
  if (!session) return null;
  await connectMongo();
  const user = await User.findOne({ restaurantId: session.restaurantId, login: session.login }).lean() as any;
  if (!user || !user.active || user.deletedAt || user.authType === 'api_token' || (user.sessionVersion || 0) !== (session.sessionVersion || 0)) return null;
  return { ...session, role: normalizeRole(user.role) };
}

export async function isWhatsappAgentRequest(request: Request) {
  if (!validAgentToken(request)) return false;
  await connectMongo();
  return Boolean(await User.exists({ restaurantId: DEFAULT_RESTAURANT_ID, login: 'whatsapp-agent', active: true, deletedAt: null, authType: 'api_token' }));
}

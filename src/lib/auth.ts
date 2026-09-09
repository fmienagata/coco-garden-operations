import crypto from 'node:crypto';

export const AUTH_COOKIE = 'coco_cuisine_session';
export const DEFAULT_RESTAURANT_ID = process.env.RESTAURANT_ID || 'coco-garden';
export type ActorType = 'management' | 'whatsapp_agent';
export type UserRole = 'admin' | 'serveur' | 'cuisinier';

export function normalizeRole(role?: string): UserRole {
  if (role === 'admin' || role === 'manager') return 'admin';
  if (role === 'cuisinier' || role === 'kitchen') return 'cuisinier';
  return 'serveur';
}

export const ROLE_MODULES: Record<UserRole, string[]> = {
  admin: ['salle', 'cuisine', 'livraison', 'carte', 'notifications', 'pilotage', 'api-docs', 'users', 'journal'],
  serveur: ['salle', 'cuisine', 'livraison', 'notifications', 'pilotage'],
  cuisinier: ['cuisine'],
};

export function roleCanAccess(role: string | undefined, module: string) {
  return ROLE_MODULES[normalizeRole(role)].includes(module);
}

export function isWhatsappAgentRequest(request: Request) {
  const token = request.headers.get('x-whatsapp-agent-token');
  return Boolean(process.env.WHATSAPP_AGENT_TOKEN && token && token === process.env.WHATSAPP_AGENT_TOKEN);
}

function getSecret() {
  return process.env.AUTH_SECRET || 'development-only-secret-change-me';
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createSession(login: string, restaurantId = DEFAULT_RESTAURANT_ID, role = 'serveur', sessionVersion = 0) {
  const payload = Buffer.from(JSON.stringify({ login, restaurantId, sessionVersion, role: normalizeRole(role), actorType: 'management', expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(value?: string) {
  if (!value) return false;
  const [payload, signature] = value.split('.');
  const expectedSignature = payload ? sign(payload) : '';
  if (!payload || !signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Boolean(session.login && session.expiresAt > Date.now());
  } catch {
    return false;
  }
}

export function credentialsAreValid(login: string, password: string) {
  return login === (process.env.CUISINE_LOGIN || 'cuisine') && password === (process.env.CUISINE_PASSWORD || 'cuisine');
}

export function getSession(value?: string) {
  if (!isValidSession(value)) return null;
  try {
    const session = JSON.parse(Buffer.from(value!.split('.')[0], 'base64url').toString());
    return { ...session, role: normalizeRole(session.role) } as { login: string; restaurantId: string; role: UserRole; actorType: ActorType; sessionVersion?: number };
  } catch {
    return null;
  }
}

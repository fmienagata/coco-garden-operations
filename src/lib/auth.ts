import crypto from 'node:crypto';

export const AUTH_COOKIE = 'coco_cuisine_session';
export const DEFAULT_RESTAURANT_ID = process.env.RESTAURANT_ID || 'coco-garden';

function getSecret() {
  return process.env.AUTH_SECRET || 'development-only-secret-change-me';
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createSession(login: string, restaurantId = DEFAULT_RESTAURANT_ID) {
  const payload = Buffer.from(JSON.stringify({ login, restaurantId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
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
    return JSON.parse(Buffer.from(value!.split('.')[0], 'base64url').toString()) as { login: string; restaurantId: string };
  } catch {
    return null;
  }
}
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from './auth';
import { getSession } from './server-session';
export const userFields = '_id login name role active authType createdAt updatedAt';
export class UserError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function requireAdmin() {
  const session = await getSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) throw new UserError('Veuillez vous reconnecter.', 401);
  if (session.role !== 'admin') throw new UserError('Accès réservé à l’administrateur.', 403);
  return session;
}
export async function readBody(request: Request) {
  let body;
  try { body = await request.json(); } catch { throw new UserError('Données JSON invalides.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Données invalides.');
  return body;
}
export function validateAccount(body: any, creating = false) {
  if (creating || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) throw new UserError('Le nom est requis (100 caractères maximum).');
  }
  if (creating || body.login !== undefined) {
    if (typeof body.login !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(body.login)) throw new UserError('Identifiant : 3 à 64 lettres, chiffres, points, tirets ou underscores.');
  }
  if (body.role !== undefined && !['admin','serveur','cuisinier'].includes(body.role)) throw new UserError('Rôle invalide.');
  if (body.active !== undefined && typeof body.active !== 'boolean') throw new UserError('Statut invalide.');
  if (creating || (body.password !== undefined && body.password !== '')) {
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new UserError('Le mot de passe doit contenir entre 8 et 128 caractères.');
  }
}
export async function userResponse(action: () => Promise<Response>) {
  try { return await action(); } catch (error: any) {
    if (error instanceof UserError) return Response.json({error: error.message}, {status:error.status});
    if (error?.code === 11000) return Response.json({error:'Cet identifiant est déjà utilisé.'}, {status:409});
    console.error('User management failure', error);
    return Response.json({error:'Opération impossible. Veuillez réessayer.'}, {status:500});
  }
}

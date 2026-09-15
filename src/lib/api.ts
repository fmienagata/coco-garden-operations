import { cookies } from 'next/headers';
import { AUTH_COOKIE, roleCanAccess, type UserRole } from './auth';
import { getSession } from './server-session';

export class UserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type ApiSession = { login: string; restaurantId: string; role: UserRole; actorType?: string };

type Guard = { module?: string; roles?: UserRole[]; message?: string };

// Le contrôle serveur réutilise ROLE_MODULES, la table qui pilote déjà la navigation :
// une seule matrice de droits pour l'interface et pour l'API, impossible à désynchroniser.
export async function requireSession(guard: Guard = {}): Promise<ApiSession> {
  const session = await getSession((await cookies()).get(AUTH_COOKIE)?.value) as ApiSession | null;
  if (!session) throw new UserError('Connexion requise.', 401);
  if (guard.module && !roleCanAccess(session.role, guard.module)) throw new UserError(guard.message || 'Ce module n’est pas accessible avec votre rôle.', 403);
  if (guard.roles && !guard.roles.includes(session.role)) throw new UserError(guard.message || 'Action non autorisée pour votre rôle.', 403);
  return session;
}

export async function readJson(request: Request): Promise<Record<string, any>> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new UserError('Données JSON invalides.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Données invalides.');
  return body as Record<string, any>;
}

// Une erreur inattendue ne doit jamais atteindre le client : ni message Mongo, ni pile, ni secret.
export async function apiResponse(action: () => Promise<Response>) {
  try { return await action(); } catch (error: any) {
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: error.status });
    if (error?.code === 11000) return Response.json({ error: 'Cet identifiant est déjà utilisé.' }, { status: 409 });
    if (error?.name === 'CastError') return Response.json({ error: 'Identifiant invalide.' }, { status: 400 });
    console.error('API failure', error);
    return Response.json({ error: 'Opération impossible. Veuillez réessayer.' }, { status: 500 });
  }
}

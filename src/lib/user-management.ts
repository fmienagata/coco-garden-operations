import { requireSession, readJson, apiResponse, UserError } from './api';
import { pinIsAcceptable } from './passwords';
export { UserError };
export const userFields = '_id login name role active authType createdAt updatedAt';
export async function requireAdmin() {
  return requireSession({ roles: ['admin'], message: 'Accès réservé à l’administrateur.' });
}
export const readBody = readJson;
export function validateAccount(body: any, creating = false) {
  if (creating || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100)
      throw new UserError('Le nom est requis (100 caractères maximum).');
  }
  if (creating || body.login !== undefined) {
    if (typeof body.login !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(body.login))
      throw new UserError('Identifiant : 3 à 64 lettres, chiffres, points, tirets ou underscores.');
  }
  if (body.role !== undefined && !['admin', 'serveur', 'cuisinier'].includes(body.role))
    throw new UserError('Rôle invalide.');
  if (body.active !== undefined && typeof body.active !== 'boolean') throw new UserError('Statut invalide.');
  if (creating || (body.password !== undefined && body.password !== '')) {
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128)
      throw new UserError('Le mot de passe doit contenir entre 8 et 128 caractères.');
  }
  // Une chaîne vide retire le PIN et ramène le compte au mot de passe seul.
  if (body.pin !== undefined && body.pin !== '') {
    if (typeof body.pin !== 'string' || !pinIsAcceptable(body.pin))
      throw new UserError('Le code doit contenir 4 à 8 chiffres, sans suite ni répétition évidente.');
  }
}
export const userResponse = apiResponse;

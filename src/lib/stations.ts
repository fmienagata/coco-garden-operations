import { UserError } from './api';

export const STATION_ADMIN = 'La configuration des postes de préparation est réservée à l’administrateur.';
export const STATION_FIELDS = '_id name destination categories isDefault printerHost printerPort printerWidth active';

/** Liste blanche des champs modifiables : un $set d'un corps reçu tel quel laisserait écrire restaurantId. */
export function validateStation(body: Record<string, any>, creating: boolean) {
  const changes: Record<string, unknown> = {};
  if (creating || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 40)
      throw new UserError('Nom de poste requis (40 caractères maximum).');
    changes.name = body.name.trim();
  }
  if (creating || body.destination !== undefined) {
    if (!['ecran', 'imprimante', 'les_deux'].includes(body.destination))
      throw new UserError('Destination invalide : écran, imprimante ou les deux.');
    changes.destination = body.destination;
  }
  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories) || body.categories.some((entry: unknown) => typeof entry !== 'string'))
      throw new UserError('Catégories invalides.');
    changes.categories = body.categories.map((entry: string) => entry.trim()).filter(Boolean);
  }
  if (body.isDefault !== undefined) {
    if (typeof body.isDefault !== 'boolean') throw new UserError('Valeur invalide pour le poste par défaut.');
    changes.isDefault = body.isDefault;
  }
  if (body.printerHost !== undefined) {
    if (typeof body.printerHost !== 'string' || body.printerHost.length > 120)
      throw new UserError('Adresse d’imprimante invalide.');
    changes.printerHost = body.printerHost.trim();
  }
  if (body.printerPort !== undefined) {
    if (!Number.isInteger(body.printerPort) || body.printerPort < 1 || body.printerPort > 65535)
      throw new UserError('Port d’imprimante invalide.');
    changes.printerPort = body.printerPort;
  }
  if (body.printerWidth !== undefined) {
    if (!Number.isInteger(body.printerWidth) || body.printerWidth < 24 || body.printerWidth > 80)
      throw new UserError('Largeur de papier invalide (24 à 80 caractères).');
    changes.printerWidth = body.printerWidth;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new UserError('Statut invalide.');
    changes.active = body.active;
  }
  // Un poste qui imprime sans adresse produirait des bons que personne ne viendrait chercher.
  if (creating && body.destination !== 'ecran' && !changes.printerHost) {
    throw new UserError('Un poste qui imprime doit indiquer l’adresse de son imprimante.');
  }
  return changes;
}

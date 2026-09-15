import crypto from 'node:crypto';

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// Un PIN de 4 chiffres reste la norme sur un point de vente ; on refuse au moins les
// suites évidentes, et l'usage est restreint aux postes enrôlés avec verrouillage.
export function pinIsAcceptable(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) return false;
  if (new Set(pin).size === 1) return false;
  const ascending = pin.split('').every((digit, index, all) => index === 0 || Number(digit) === Number(all[index - 1]) + 1);
  const descending = pin.split('').every((digit, index, all) => index === 0 || Number(digit) === Number(all[index - 1]) - 1);
  return !ascending && !descending;
}

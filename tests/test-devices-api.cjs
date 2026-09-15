const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('@next/env').loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

const rid = () => crypto.randomBytes(4).toString('hex');
const users = [];
const devices = [];

(async () => {
  const admin = await call('/api/auth/login', 'POST', { login: process.env.CUISINE_LOGIN, password: process.env.CUISINE_PASSWORD });
  assert.equal(admin.status, 200, 'Connexion admin impossible');
  const auth = { Cookie: admin.cookie };

  // --- Enrolement du poste ---
  const prefix = 'T' + crypto.randomBytes(1).toString('hex').toUpperCase();
  const device = await call('/api/devices', 'POST', { name: 'Caisse de test', kind: 'caisse', numberPrefix: prefix.toLowerCase() }, auth);
  assert.equal(device.status, 201, `Enrolement echoue: ${JSON.stringify(device.data)}`);
  assert.ok(device.data.token && device.data.token.startsWith('dev_'), 'Le jeton de poste doit etre renvoye une fois');
  assert.equal(device.data.numberPrefix, prefix, 'Le prefixe doit etre normalise en majuscules');
  devices.push(device.data._id);
  let token = device.data.token;

  assert.equal((await call('/api/devices', 'POST', { name: 'Doublon', kind: 'salle', numberPrefix: prefix }, auth)).status, 409, 'Un prefixe deja pris doit etre refuse');
  assert.equal((await call('/api/devices', 'POST', { name: 'Mauvais', kind: 'salle', numberPrefix: 'TROP-LONG' }, auth)).status, 400, 'Un prefixe invalide doit etre refuse');
  assert.equal((await call('/api/devices', 'POST', { name: 'Mauvais', kind: 'avion', numberPrefix: 'ZZ' }, auth)).status, 400, 'Un type de poste invalide doit etre refuse');

  // Le jeton ne doit jamais etre relisible apres coup.
  const listed = await call('/api/devices', 'GET', undefined, auth);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.find((item) => item._id === device.data._id).token, undefined, 'Le jeton ne doit jamais etre relu apres enrolement');

  // --- Enrolement reserve a administrateur ---
  const serveurLogin = 'poste-serveur-' + rid();
  const serveur = await call('/api/users', 'POST', { login: serveurLogin, name: 'Serveur poste', password: 'PosteTest2026!', role: 'serveur' }, auth);
  assert.equal(serveur.status, 201);
  users.push(serveur.data._id);
  const serveurSession = await call('/api/auth/login', 'POST', { login: serveurLogin, password: 'PosteTest2026!' });
  assert.equal((await call('/api/devices', 'POST', { name: 'Interdit', kind: 'salle', numberPrefix: 'ZZ' }, { Cookie: serveurSession.cookie })).status, 403, 'Un serveur ne doit pas enroler un poste');

  // --- La liste de reprise exige un poste reconnu ---
  assert.equal((await call('/api/auth/pin', 'GET')).status, 401, 'Sans jeton de poste, la liste doit etre refusee');
  assert.equal((await call('/api/auth/pin', 'GET', undefined, { 'x-device-token': 'dev_inconnu' })).status, 401, 'Un jeton inconnu doit etre refuse');

  // --- Codes trop faibles refuses ---
  for (const weak of ['0000', '1234', '9876', '12', 'abcd']) {
    const rejected = await call('/api/users', 'POST', { login: 'faible-' + rid(), name: 'Code faible', password: 'PosteTest2026!', role: 'serveur', pin: weak }, auth);
    assert.equal(rejected.status, 400, `Le code ${weak} doit etre refuse`);
  }

  // --- Connexion par code ---
  const goodLogin = 'poste-pin-' + rid();
  const withPin = await call('/api/users', 'POST', { login: goodLogin, name: 'Ange Test', password: 'PosteTest2026!', role: 'serveur', pin: '4817' }, auth);
  assert.equal(withPin.status, 201, `Creation avec code echouee: ${JSON.stringify(withPin.data)}`);
  users.push(withPin.data._id);

  const roster = await call('/api/auth/pin', 'GET', undefined, { 'x-device-token': token });
  assert.equal(roster.status, 200, 'La liste doit repondre avec un poste reconnu');
  assert.equal(roster.data.device.numberPrefix, prefix, 'La liste doit identifier le poste');
  assert.ok(roster.data.staff.some((item) => item.login === goodLogin), 'Le compte avec code doit apparaitre');
  assert.ok(!roster.data.staff.some((item) => item.login === serveurLogin), 'Un compte sans code ne doit pas apparaitre');
  assert.ok(roster.data.staff.every((item) => item.pinHash === undefined), 'Aucune empreinte de code ne doit sortir');

  const signed = await call('/api/auth/pin', 'POST', { login: goodLogin, pin: '4817' }, { 'x-device-token': token });
  assert.equal(signed.status, 200, `Connexion par code echouee: ${JSON.stringify(signed.data)}`);
  assert.ok(signed.cookie, 'La connexion par code doit ouvrir une session');
  const session = await call('/api/auth/session', 'GET', undefined, { Cookie: signed.cookie });
  assert.equal(session.data.login, goodLogin, 'La session ouverte doit porter le bon compte');

  assert.equal((await call('/api/auth/pin', 'POST', { login: goodLogin, pin: '4817' })).status, 401, 'Le code ne doit pas fonctionner sans poste enrole');

  // --- Verrouillage apres cinq essais ---
  const lockLogin = 'poste-lock-' + rid();
  const locked = await call('/api/users', 'POST', { login: lockLogin, name: 'Compte bloque', password: 'PosteTest2026!', role: 'serveur', pin: '7391' }, auth);
  assert.equal(locked.status, 201);
  users.push(locked.data._id);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const wrong = await call('/api/auth/pin', 'POST', { login: lockLogin, pin: '0001' }, { 'x-device-token': token });
    assert.equal(wrong.status, 401, `Essai ${attempt} : un code faux doit rendre 401`);
  }
  assert.equal((await call('/api/auth/pin', 'POST', { login: lockLogin, pin: '0001' }, { 'x-device-token': token })).status, 429, 'Le cinquieme essai doit bloquer le compte');
  assert.equal((await call('/api/auth/pin', 'POST', { login: lockLogin, pin: '7391' }, { 'x-device-token': token })).status, 429, 'Le bon code ne doit pas ouvrir un compte bloque');

  // Un compte inconnu repond exactement comme un code faux : aucune enumeration.
  assert.equal((await call('/api/auth/pin', 'POST', { login: 'inexistant-' + rid(), pin: '4817' }, { 'x-device-token': token })).status, 401, 'Un compte inconnu doit repondre comme un code faux');

  // Redefinir le code libere le verrouillage.
  assert.equal((await call(`/api/users/${locked.data._id}`, 'PATCH', { pin: '5264' }, auth)).status, 200);
  assert.equal((await call('/api/auth/pin', 'POST', { login: lockLogin, pin: '5264' }, { 'x-device-token': token })).status, 200, 'Un code redefini doit debloquer le compte');

  // Retirer le code sort le compte de la reprise par PIN.
  assert.equal((await call(`/api/users/${locked.data._id}`, 'PATCH', { pin: '' }, auth)).status, 200);
  assert.equal((await call('/api/auth/pin', 'POST', { login: lockLogin, pin: '5264' }, { 'x-device-token': token })).status, 401, 'Un code retire ne doit plus ouvrir de session');

  // --- Revocation du jeton de poste ---
  const rotated = await call(`/api/devices/${device.data._id}`, 'PATCH', { rotateToken: true }, auth);
  assert.equal(rotated.status, 200, 'La rotation du jeton doit reussir');
  assert.ok(rotated.data.token && rotated.data.token !== token, 'La rotation doit livrer un nouveau jeton');
  assert.equal((await call('/api/auth/pin', 'GET', undefined, { 'x-device-token': token })).status, 401, 'Un jeton revoque doit cesser de fonctionner');
  token = rotated.data.token;
  assert.equal((await call('/api/auth/pin', 'GET', undefined, { 'x-device-token': token })).status, 200, 'Le nouveau jeton doit fonctionner');

  // Un poste retire est coupe immediatement.
  assert.equal((await call(`/api/devices/${device.data._id}`, 'DELETE', undefined, auth)).status, 204, 'Le retrait du poste doit reussir');
  assert.equal((await call('/api/auth/pin', 'GET', undefined, { 'x-device-token': token })).status, 401, 'Un poste retire ne doit plus etre reconnu');
  devices.pop();

  for (const id of users) await call(`/api/users/${id}`, 'DELETE', undefined, auth);
  for (const id of devices) await call(`/api/devices/${id}`, 'DELETE', undefined, auth);
  console.log('PASS: enrolement, revocation de jeton, liste de reprise, connexion par code, verrouillage et retrait du code.');
})().catch((error) => { console.error('ECHEC', error.message); process.exitCode = 1; });

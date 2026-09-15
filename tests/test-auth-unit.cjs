const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/lib/auth.ts');

function withEnv(vars, run) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('aucun identifiant de secours ne subsiste dans le module d’authentification', () => {
  assert.equal(auth.credentialsAreValid, undefined);
});

test('en production, une session ne peut pas être signée sans AUTH_SECRET', () => {
  withEnv({ NODE_ENV: 'production', AUTH_SECRET: undefined }, () => {
    assert.throws(() => auth.createSession('admin'), /AUTH_SECRET/);
  });
});

test('hors production, la signature reste possible pour le développement local', () => {
  withEnv({ NODE_ENV: 'development', AUTH_SECRET: undefined }, () => {
    assert.equal(auth.isValidSession(auth.createSession('serveur-local')), true);
  });
});

test('une élévation de rôle dans la charge utile invalide la session', () => {
  withEnv({ AUTH_SECRET: 'secret-de-test' }, () => {
    const token = auth.createSession('serveur', 'coco-garden', 'serveur');
    const [payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    decoded.role = 'admin';
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url') + '.' + signature;
    assert.equal(auth.isValidSession(forged), false);
    assert.equal(auth.getSession(forged), null);
  });
});

test('une session signée avec un autre secret est rejetée', () => {
  const token = withEnv({ AUTH_SECRET: 'secret-de-l-attaquant' }, () =>
    auth.createSession('admin', 'coco-garden', 'admin'),
  );
  withEnv({ AUTH_SECRET: 'secret-du-serveur' }, () => {
    assert.equal(auth.isValidSession(token), false);
  });
});

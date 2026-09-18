/**
 * Garde-fous d'architecture.
 *
 * Chaque règle ici correspond à une faille réellement trouvée dans ce dépôt. Le but n'est
 * pas d'imposer un style, c'est d'empêcher la même erreur de revenir une fois que personne
 * ne s'en souviendra.
 *
 * ESLint n'est pas utilisé pour l'instant : `typescript-eslint`, dont dépend
 * `eslint-config-next`, ne supporte pas encore TypeScript 7 et refuse de démarrer. Ces
 * règles-là sont suffisamment ciblées pour tenir dans un script, et elles tournent en CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const API = path.join(SRC, 'app', 'api');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const relative = (file) => path.relative(ROOT, file).replace(/\\/g, '/');
const findings = [];
const report = (file, line, rule, message) => findings.push({ file: relative(file), line, rule, message });

// Routes publiques par conception : authentification et sonde de santé.
const OPEN_ROUTES = ['api/auth/login', 'api/auth/logout', 'api/auth/session', 'api/auth/pin', 'api/health'];

for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const where = relative(file);
  const isRoute = where.startsWith('src/app/api/') && where.endsWith('/route.ts');

  lines.forEach((text, index) => {
    const at = index + 1;

    // Recopier un corps de requête dans un document laisse écrire total, status et
    // restaurantId. C'est la faille corrigée dans PUT /api/orders/[id].
    if (/Object\.assign\s*\(\s*(order|user|item|zone|driver|device|station|doc)\b/.test(text)) {
      report(file, at, 'mass-assign', 'Object.assign sur un document : énumérez les champs autorisés.');
    }

    // $set d'une variable entière écrit tout ce qu'elle contient, y compris restaurantId.
    if (/\$set:\s*(body|patch|payload|data|input)\b/.test(text)) {
      report(file, at, 'mass-assign', '$set d’un corps reçu tel quel : construisez un objet de champs autorisés.');
    }

    // Un corps malformé doit rendre 400, pas 500. readJson s'en charge.
    if (isRoute && /await\s+request\.json\(\)/.test(text) && !/catch/.test(text)) {
      report(file, at, 'json-parse', 'Lisez le corps avec readJson : un JSON invalide doit rendre 400, pas 500.');
    }

    // Un identifiant non validé produit un CastError, donc une 500 au lieu d'une 400.
    if (/Order\.find\(\s*\{\s*restaurantId[^}]*\}\s*\)[\s\S]{0,40}\.lean\(\)[\s\S]{0,80}\.find\(/.test(text)) {
      report(file, at, 'full-scan', 'Balayage complet de collection : filtrez dans Mongo, pas en mémoire.');
    }
  });

  // Toute route métier vérifie ses droits côté serveur : la navigation ne protège rien.
  if (isRoute && !OPEN_ROUTES.some((open) => where.includes(open))) {
    if (!/requireSession|requireAdmin|diningSession|requireDevice/.test(source)) {
      report(file, 1, 'auth', 'Route sans contrôle d’accès serveur : passez par requireSession.');
    }
  }

  // Une mutation doit être auditable.
  if (isRoute && /export const (POST|PUT|PATCH|DELETE)/.test(source) && !/withAudit/.test(source)) {
    report(file, 1, 'audit', 'Mutation non enveloppée par withAudit.');
  }
}

// Le secret de session ne doit jamais avoir de repli silencieux en production.
const auth = fs.readFileSync(path.join(SRC, 'lib', 'auth.ts'), 'utf8');
if (!/AUTH_SECRET is required in production/.test(auth)) {
  report(
    path.join(SRC, 'lib', 'auth.ts'),
    1,
    'secret',
    'AUTH_SECRET doit échouer en production plutôt que de se replier.',
  );
}

if (!fs.existsSync(API)) {
  console.error('Aucune route API trouvée : le script est-il lancé depuis la racine du projet ?');
  process.exit(1);
}

if (findings.length === 0) {
  console.log('Garde-fous : aucun manquement.');
  process.exit(0);
}

console.error(`Garde-fous : ${findings.length} manquement${findings.length > 1 ? 's' : ''}.\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  [${finding.rule}]  ${finding.message}`);
}
console.error('\nCes règles correspondent à des failles réellement corrigées dans ce dépôt.');
process.exit(1);

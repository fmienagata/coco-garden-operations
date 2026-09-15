# Guide agent - Coco Garden Operations

Ce document donne le contexte opérationnel nécessaire pour intervenir sur le projet sans redécouvrir son architecture à chaque session.

## Mission du projet

Coco Garden Operations est une application Next.js de gestion des commandes d'un restaurant :

- prise de commande en salle ;
- préparation en cuisine ;
- commandes à emporter ;
- livraisons et livreurs ;
- notifications WhatsApp préparées manuellement ;
- pilotage des ventes et encaissements ;
- utilisateurs, sessions et journal d'activité.

L'application utilise MongoDB via Mongoose. Les montants sont des entiers en XAF/FCFA.

## Démarrer

Prérequis : Node.js 24 LTS, npm, MongoDB et Git.

```powershell
npm.cmd ci
npm.cmd run dev
```

L'application locale écoute sur `http://127.0.0.1:3001`.
La santé du service est disponible sur `/api/health`.

Variables indispensables en local :

```env
MONGO_URI=mongodb://127.0.0.1:27017/coco_garden
RESTAURANT_ID=coco-garden
AUTH_SECRET=secret-local-uniquement
CUISINE_LOGIN=cuisine-test
CUISINE_PASSWORD=mot-de-passe-local
NEXT_PUBLIC_RESTAURANT_NAME=Coco Garden
```

Ne jamais committer `.env.local`, les mots de passe, les jetons WhatsApp ou les clés privées.

## Validation obligatoire

Avant de terminer une modification, exécuter au minimum :

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Tests fonctionnels disponibles :

```powershell
npm.cmd run test:orders
npm.cmd run test:salle
npm.cmd run test:pilotage
npm.cmd run test:pilotage:api
npm.cmd run test:users
npm.cmd run test:audit
npm.cmd run test:roles
npm.cmd run test:auth
npm.cmd run test:devices
npm.cmd run test:sync
npm.cmd run test:offline
npm.cmd run test:routing
npm.cmd run test:kitchen
```

Les tâches équivalentes sont disponibles dans `.vscode/tasks.json`.
Les tests API nécessitent un serveur Next actif et une base Mongo accessible.

## Architecture utile

- `src/app/` : pages Next.js et routes API.
- `src/app/api/` : mutations et lectures côté serveur.
- `src/components/` : navigation et composants partagés.
- `src/lib/models/` : schémas Mongoose.
- `src/lib/` : authentification, sessions, règles métier, audit et pilotage.
- `tests/` : tests unitaires et intégration HTTP.
- `scripts/` : seeds et migrations contrôlées.
- `docs/` : documentation fonctionnelle et architecture.

Les routes serveur doivent toujours dériver `restaurantId` de la session ou de l'authentification de l'Agent WhatsApp. Ne jamais faire confiance à un `restaurantId` fourni par le navigateur.

## Rôles

- `admin` : accès complet, configuration des tables, utilisateurs, journal et pilotage.
- `serveur` : accès à la Salle, création et suivi des tickets, sans configuration des tables.
- `cuisinier` : accès à la Cuisine uniquement.
- `whatsapp-agent` : compte technique API, création de commandes uniquement avec `x-whatsapp-agent-token`.

Les droits doivent être vérifiés côté serveur, même si la navigation masque déjà les modules interdits.

### Contrôle des droits dans les routes API

`src/lib/api.ts` porte le socle commun : `requireSession`, `readJson` et `apiResponse`.

`requireSession({ module })` s'appuie sur `ROLE_MODULES` (`src/lib/auth.ts`), la même table que la
navigation : une seule matrice pour l'interface et pour l'API, impossible à désynchroniser.
`requireSession({ roles })` sert aux actions qui ne correspondent à aucun module : configuration
et suppression.

| Route | Contrôle |
| --- | --- |
| `GET /api/orders`, `/api/orders/update`, `/api/orders/[id]`, notifications WhatsApp | module `cuisine` |
| `POST /api/orders` | `admin` + `serveur`, ou l'Agent WhatsApp par en-tête |
| `DELETE /api/orders/[id]`, `POST /api/orders/delete` | `admin` |
| `POST /api/delivery/[id]`, `GET /api/drivers`, `PUT /api/drivers/[id]` | module `livraison` |
| `POST /api/drivers`, `/api/menu` en écriture, `/api/delivery-zones` en écriture | `admin` |
| `GET /api/menu`, `GET /api/delivery-zones` | session seule : données de référence |
| `/api/notifications` | module `notifications` |
| `/api/pilotage`, `/api/pilotage/actions` | module `pilotage` |
| `/api/salle/**` | module `salle` ; `POST /api/salle/tables` en plus `admin` |
| `/api/users`, `/api/audit` | `admin` |

Règles à tenir pour toute nouvelle route :

- passer par `requireSession`, jamais par `cookies()` et `getSession` directement ;
- lire le corps avec `readJson`, qui rend 400 sur un JSON invalide au lieu de 500 ;
- envelopper le handler dans `apiResponse`, qui traduit `UserError` et masque les erreurs internes ;
- pour une mise à jour, énumérer les champs autorisés ; `$set` d'un corps reçu tel quel permet
  d'écrire `restaurantId` et de sortir la donnée du tenant.

Le test `npm.cmd run test:roles` vérifie cette matrice de bout en bout.

### Postes et reprise par code

Un poste (`src/lib/models/Device.ts`) est une identité durable : il portera sa plage de numéros
et signera les opérations produites hors ligne. Il s'authentifie par l'en-tête `x-device-token`.

- Le jeton porte 256 bits d'entropie et n'est stocké qu'en SHA-256 : une KDF lente serait payée
  à chaque requête sans rien apporter contre une force brute. Un PIN, à l'inverse, a peu
  d'entropie : il passe par scrypt et par un verrouillage.
- Le jeton n'est lisible qu'à l'enrôlement et à la rotation (`PATCH` avec `rotateToken: true`).
  Un poste perdu se coupe par rotation ou par `DELETE`, qui est un retrait logique afin que les
  numéros déjà émis restent lisibles.
- `GET /api/auth/pin` rend la liste de reprise pour un poste reconnu ; `POST /api/auth/pin`
  ouvre la session. Le compte est choisi dans la liste puis confirmé par son code, ce qui évite
  d'imposer des PIN uniques dans l'établissement.
- Cinq échecs bloquent le compte quinze minutes. Le verrouillage est persisté en base pour
  survivre à un redémarrage et rester valable en multi-instance. Un compte inconnu répond
  exactement comme un code faux.
- Les codes trop évidents sont refusés : répétition d'un chiffre, suite croissante ou
  décroissante. Le mot de passe reste la voie d'accès complète ; le code ne sert qu'à la
  reprise de poste en service.

`npm.cmd run test:devices` couvre l'ensemble.

### Reprise hors ligne : plages de numéros et journal d'opérations

Deux mécanismes permettent à un poste de continuer à travailler pendant une coupure.

**Plages de numéros.** `POST /api/number-leases` concède au poste une plage à consommer hors
ligne. La plage vient du même compteur atomique `OrderCounter` que la numérotation en ligne :
deux postes ne peuvent donc jamais recevoir le même numéro, sans coordination entre eux. Un
numéro produit hors ligne s'écrit `CMD-<PREFIXE>-<seq>` et est vérifié à la reprise : un poste
ne peut pas s'attribuer un numéro hors de ses plages, ni un numéro portant le préfixe d'un
autre poste.

**Journal d'opérations.** `POST /api/sync` rejoue les gestes métier produits hors ligne, pas
l'état final : c'est ce qui permet au serveur d'arbitrer les conflits avec ce qui s'est passé
ailleurs pendant la coupure, au lieu d'écraser aveuglément. Trois propriétés le tiennent :

- L'identifiant d'opération est déterministe côté serveur (`<restaurantId>:<opId>`, même motif
  que `Settlement`). Un rejeu rend le résultat déjà enregistré au lieu de dupliquer.
- **Un refus est enregistré comme tel.** Sans cela, une opération devenue impossible serait
  réémise indéfiniment par un poste qui n'obtient jamais de réponse définitive.
- Une opération en échec n'interrompt pas le lot : le lot répond toujours 200 et chaque
  opération porte son propre sort, sinon une seule opération empoisonnée bloquerait toute la
  reprise du poste.

Un échec d'infrastructure rend `retry` et n'est pas enregistré ; une règle métier violée rend
`rejected` et l'est définitivement. Un ticket `completed` ou `cancelled` ne se rejoue jamais.

Types acceptés aujourd'hui : `order.create`, `order.advance`, `salle.ticket.create`,
`salle.ticket.send`, `salle.ticket.serve`. Le registre est dans `src/lib/operations.ts` ; en
ajouter un consiste à écrire une fonction et rien d'autre. La tarification passe par
`src/lib/order-intake.ts`, partagé avec la route en ligne : une commande suit exactement le
même chemin de validation qu'elle arrive en direct ou après une coupure.

**Limite connue.** L'auteur enregistré est la session qui dépose le lot, pas nécessairement
celle qui a produit chaque geste hors ligne. Une attribution par opération demandera que le
poste conserve plusieurs sessions ouvertes en parallèle.

`npm.cmd run test:sync` couvre plages disjointes, intégrité des numéros, rejeu sans doublon,
refus définitifs, isolation du lot et refus sur ticket clos.

### Le poste hors ligne

`next.config.ts` active `experimental.useOffline`. Le hook `useOffline` de `next/offline`
sonde réellement le serveur en `HEAD` avec repli progressif : il détecte donc le cas courant
d'un appareil accroché au WiFi du restaurant alors que la liaison Internet est tombée, là où
`navigator.onLine` répondrait « connecté ». **Ne pas réécrire cette détection à la main.**

- `src/lib/offline/core.ts` : toute la logique qui décide, sans aucune API navigateur.
  Consommation des numéros, réconciliation de la file, vue optimiste. C'est ce qui se teste
  en Node via `npm.cmd run test:offline`.
- `src/lib/offline/db.ts` : IndexedDB, choisi plutôt que localStorage parce que la file doit
  survivre à une fermeture brutale et peut contenir des tickets entiers.
- `src/lib/offline/client.ts` : enrôlement, réserve de numéros, file, reprise.
- `public/sw.js` : Next reprend les navigations au retour du réseau, mais un **rechargement
  complet** pendant une coupure échoue toujours, faute de HTML. Le service worker sert la
  coque des écrans et la dernière lecture connue. Il n'intercepte jamais une écriture :
  rejouer une écriture doublerait une commande.
- `/poste` : enrôlement par jeton, réserve restante, file locale et opérations refusées.

Règles à tenir :

- **Le curseur de numérotation est écrit avant que l'opération entre en file.** Une coupure
  entre les deux fait perdre un numéro, ce qui est sans conséquence ; l'ordre inverse
  attribuerait deux fois le même numéro et créerait deux commandes sous la même référence.
- **Une seule reprise à la fois.** Deux envois simultanés laisseraient la file locale
  incohérente, même si le serveur dédoublonne.
- **Une opération refusée quitte la file.** La garder la ferait rejouer sans fin. Elle est
  affichée sur `/poste` pour que quelqu'un la traite en salle.
- Une lecture qui échoue ne vide jamais l'écran : on garde ce que le poste sait déjà.

**Ce qui est câblé à ce jour** : la Cuisine bascule en file dès que le réseau tombe, y compris
quand la liaison casse en plein appel. La Salle et la prise de commande utilisent encore
l'appel direct ; leurs types d'opération existent déjà côté serveur.

Le service worker n'est enregistré qu'en production. Pour l'éprouver :
`npm.cmd run build` puis `npm.cmd run start`, et couper le réseau dans les outils du
navigateur. Le mode développement n'est pas une référence fiable pour le hors ligne.

### Postes de préparation : écran et impression

Une commande confirmée part aux **postes de préparation** (`PreparationStation`). Chaque poste
a une destination — `ecran`, `imprimante` ou `les_deux` — et reçoit les catégories de carte
qui le concernent. C'est un réglage par établissement : certains clients n'auront qu'une
imprimante, d'autres qu'une tablette. **Rien de tout cela ne doit être écrit en dur.**

- `src/lib/kitchen-routing.ts` : répartition des lignes et mise en page du bon. Pur, donc
  testable sans imprimante (`npm.cmd run test:routing`).
- `src/lib/kitchen-dispatch.ts` : création des bons et file d'un poste sur écran.
- `scripts/print-agent.js` : agent à lancer sur le PC de la caisse. Il réclame les bons et
  les envoie en ESC/POS sur le réseau local, puisqu'un navigateur ne pilote pas une
  imprimante thermique.

Règles à tenir :

- **Une catégorie non adressée tombe sur le poste par défaut.** Sans ce filet, un plat
  ajouté à la carte sans qu'on pense au routage disparaîtrait de la cuisine en silence.
- **L'identifiant du bon est déterministe** (`<restaurantId>:<orderId>:<stationId>`, même
  motif que `Settlement` et `Operation`). Une confirmation rejouée après coupure ne fait
  jamais sortir le plat deux fois.
- **La réclamation d'un bon est atomique.** Deux agents branchés par erreur sur la même
  imprimante ne peuvent pas sortir le même bon.
- **Un échec de distribution n'annule jamais la confirmation.** Refuser une commande parce
  qu'une imprimante est injoignable arrêterait le service ; un bon manquant se rattrape.
- Un bon en échec repart en file, et s'arrête après cinq essais plutôt que de tourner en
  boucle : une imprimante débranchée doit se voir.
- **Aucun prix sur un bon de préparation** : cela n'aide personne et allonge le papier.

Les accents ne passent pas en UTF-8 sur une imprimante thermique. L'agent sélectionne la page
de codes 850 et convertit les caractères français ; un caractère hors table sort en point
d'interrogation plutôt qu'en octet illisible.

Pour vérifier la mise en page sans matériel :

```powershell
$env:PRINT_AGENT_TOKEN = "dev_..."
$env:PRINT_AGENT_OUTPUT = "texte"
npm.cmd run print-agent
```

**Limite connue.** Un bon est produit à la confirmation, une seule fois par commande et par
poste. L'envoi par tour et l'ajout de lignes à un ticket déjà parti ne sont pas encore
modélisés. La configuration des postes se fait par l'API : il n'y a pas encore d'écran
d'administration.

`npm.cmd run test:kitchen` couvre le routage, la séparation des bons, la réclamation unique,
la reprise après échec, l'absence de doublon au rejeu et la file par écran.


## Cycle d'une commande

### Salle

Une table peut avoir plusieurs tickets indépendants :

```text
draft -> confirmed -> preparing -> ready -> served -> completed
```

- `draft` est modifiable et n'est pas envoyé à la Cuisine.
- `confirmed` est visible dans la Cuisine.
- la Cuisine fait progresser `confirmed -> preparing -> ready`.
- la Salle confirme le service avec `served`.
- le paiement transforme le ticket en `completed` et renseigne `completedAt`.
- une annulation autorisée utilise `cancelled` avec un motif.

### À emporter

```text
pending -> confirmed -> preparing -> ready -> completed
```

`completed` est écrit après confirmation de la remise au client (`collect`). Une commande à emporter n'est pas liée à une table.

### Livraison

```text
ready -> driver_assigned -> in_delivery -> completed
```

`completed` est écrit après confirmation de la remise par le livreur. Une livraison n'est pas liée à une table.

`completed` est le statut terminal canonique. Les anciens statuts `served`, `collected` et `delivered` restent lisibles pour préserver l'historique existant.

## Règles de modification

- Ne pas utiliser `Object.assign(order, body)` sur une route API.
- Utiliser une liste blanche de champs et de transitions.
- Protéger les mutations concurrentes avec `__v` ou une condition atomique.
- Les prix doivent toujours être relus depuis la carte active en base.
- Ne jamais accepter un total calculé par le navigateur.
- Les actions de paiement, retrait, remboursement et service exigent une confirmation explicite.
- Une mutation métier doit être auditée quand la route est déjà enveloppée par `withAudit`.
- Une erreur serveur ne doit pas exposer de secret, mot de passe, jeton ou détails Mongo en production.

## Données de test et migrations

Seeds disponibles :

```powershell
npm.cmd run seed:users
npm.cmd run seed:menu
npm.cmd run seed:delivery-zones
npm.cmd run seed:salle
```

Les seeds doivent être idempotents et ne pas supprimer les données réelles.

La migration des anciens états terminaux est :

```powershell
npm.cmd run migrate:completed
```

Elle ne convertit que les commandes ayant une date de fin identifiable et peut être relancée sans doublon.

## Méthode de travail recommandée

1. Lire le module et sa route API avant de modifier l'interface.
2. Identifier la règle métier qui décide réellement du comportement.
3. Ajouter ou mettre à jour un test qui reproduit le cas.
4. Faire la plus petite modification cohérente avec les abstractions existantes.
5. Lancer d'abord le test ciblé, puis `typecheck` et `build`.
6. Vérifier `git diff` et ne jamais écraser les changements déjà présents.
7. Pour une modification de statut, vérifier Salle, Cuisine, Livraison et Pilotage ensemble.

## Déploiement VPS

En production, utiliser une base Mongo dédiée, un processus long vivant (`pm2` ou service systemd), et un reverse proxy existant (`Nginx` ou Caddy). L'application doit écouter uniquement sur `127.0.0.1:3001`; le DNS doit pointer vers un sous-domaine dédié et le reverse proxy doit gérer HTTPS.

Ne pas lancer `npm run dev` en production. Utiliser :

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

## Pièges connus

- Après modification d'un modèle Mongoose, redémarrer l'instance Next de développement pour éviter un modèle chargé en cache.
- Les commandes Salle exigent le modèle `fulfillmentType: dine_in`.
- Les commandes `takeaway` et `delivery` ne doivent pas contenir de table.
- Certains anciens articles de carte peuvent ne pas avoir `variants`; l'interface doit traiter ce champ comme optionnel.
- Un statut `ready` signifie "préparée", pas "terminée".
- Le module Livraison ne doit pas afficher une colonne opérationnelle séparée pour l'ancien statut `delivered`; utiliser `Terminées`.

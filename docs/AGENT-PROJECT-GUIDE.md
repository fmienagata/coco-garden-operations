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

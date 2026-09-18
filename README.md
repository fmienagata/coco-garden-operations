# Coco Garden — Cuisine & Livraison

Projet de gestion des commandes du restaurant, de la confirmation à la remise au client.

## État du projet

Le premier module cuisine est disponible : connexion, tableau des commandes et progression de `À confirmer` à `Prêtes`.
Les modules livraison, dashboard et notifications restent à développer.
Cette version n'est pas prête à gérer des commandes réelles.

## Démarrer dans VS Code

Prérequis : Node.js 24 LTS, npm et Git.

```powershell
npm.cmd ci
npm.cmd run dev
```

Ouvrir http://localhost:3001. Vérification de santé : http://localhost:3001/api/health.
Les tâches VS Code sont disponibles via Terminal > Exécuter la tâche.

## Vérifier le projet

```powershell
npm.cmd run typecheck
npm.cmd run build
```

## Charger des données de démonstration

```powershell
npm.cmd run seed:demo
```

La commande ajoute huit commandes de démonstration en FCFA dans les différents états de la cuisine. Elle ne supprime rien et ne les ajoute qu'une seule fois pour le restaurant configuré.

Pour charger la carte Coco Garden de démonstration :

```powershell
npm.cmd run seed:menu
```

La gestion manuelle de la carte est disponible sur `/carte` après connexion.

Le module Salle est disponible sur `/salle` après connexion. Il simule entièrement le service en salle : tables, brouillon, envoi en cuisine, service, encaissement, impression de facture et annulation avec motif. Les données de test peuvent être chargées avec `npm run seed:salle` pour vérifier les transitions métier sans toucher la production.

Le module Livraison est disponible sur `/livraison` après connexion. Il permet d'ajouter des livreurs, d'affecter une commande prête, d'enregistrer le départ et de confirmer la remise au client.
Les livreurs n'ont pas de compte dans l'application : le management les inscrit, conserve leur numéro WhatsApp et met à jour leur disponibilité. Seuls les livreurs disponibles peuvent être affectés.
Le centre Notifications est disponible sur `/notifications`. Il conserve l'historique des messages WhatsApp livreur/client, leur statut, l'heure d'envoi et permet une relance manuelle.

### Cycle de vie d'une commande

`ready` signifie que la cuisine a terminé la préparation ; ce n'est pas encore la clôture commerciale. La clôture utilise le statut `completed` et `completedAt` : en salle après le service et l'encaissement, à emporter après la remise confirmée, et en livraison après la confirmation de remise par le livreur. Les anciens statuts `served`, `collected` et `delivered` restent lus pour préserver l'historique déjà enregistré.
Les zones et tarifs de livraison sont gérés par le management sur `/livraison`. Les nouvelles commandes livrées utilisent une zone active et ajoutent automatiquement son tarif au total.
Le module `/users` répertorie les créateurs management. Chaque commande conserve son auteur : utilisateur management ou `Agent WhatsApp`. L'agent utilise `WHATSAPP_AGENT_TOKEN` côté serveur et les livreurs ne disposent d'aucun compte.
L'Agent WhatsApp n'est pas un utilisateur d'interface : son unique permission est de créer des commandes via `POST /api/orders` avec l'en-tête serveur `x-whatsapp-agent-token`. Il ne peut pas consulter ou modifier les modules management.

## Configuration future

Copier `.env.example` vers `.env.local` lorsque les services seront raccordés.
Ne jamais publier `.env.local`, les jetons WhatsApp ou les clés privées Supabase.
Aucun secret n'est nécessaire pour lancer le socle actuel.

Pour le poste cuisine, définir `AUTH_SECRET`, `CUISINE_LOGIN` et `CUISINE_PASSWORD` dans `.env.local`.
Sans ces variables, le développement local utilise `cuisine` / `cuisine`.
Les montants sont stockés en nombres entiers et affichés en FCFA (XAF). Pour chaque restaurant, `RESTAURANT_ID` doit être unique ; cette clé isole les commandes entre établissements. Le nom affiché est défini par `NEXT_PUBLIC_RESTAURANT_NAME`.
Une commande à livrer exige le téléphone du client et l'adresse de livraison. L'endpoint `/api/orders/[id]/whatsapp` prépare le message détaillé et le lien WhatsApp pour le livreur ; l'envoi automatisé nécessitera ensuite WhatsApp Cloud API.

## Structure

- `src/app` : interface et routes API.
- `docs/ARCHITECTURE.md` : architecture cible et règles métier.
- `.vscode` : réglages et tâches de développement.

La création du dépôt GitHub constitue une sauvegarde du code ; elle ne déploie pas l'application en production.

### Gestion des utilisateurs

Le module Utilisateurs propose création, consultation, modification, activation/désactivation et suppression. La suppression est logique : le compte disparaît de la liste et perd son accès, mais son identifiant reste réservé pour préserver la traçabilité. Les opérations exigent un administrateur actif du même restaurant. Le compte courant ne peut être supprimé ou privé de ses droits.

Les connexions utilisent désormais les comptes MongoDB : `npm run seed:users` initialise le compte configuré et l’Agent WhatsApp sans écraser les comptes existants. Les changements de rôle sont lus à chaque requête ; les changements de mot de passe, désactivations et suppressions invalident les sessions. L’agent API doit être actif en base.

Vérification : `npm run test:users` (serveur démarré). Ce test crée un compte temporaire, vérifie le cycle CRUD et les accès, puis nettoie uniquement ce compte.

### Journal d’activité

Le module `/journal` et `GET /api/audit` sont réservés aux administrateurs. Le journal enregistre les mutations API, connexions/déconnexions et lectures refusées ou en erreur. Les lectures réussies et le contrôle de santé sont exclus pour éviter les événements de polling. Il ne reconstitue pas les opérations antérieures à son installation.

Chaque événement contient uniquement le restaurant, l’identifiant de l’acteur authentifié (ou une catégorie anonyme), la méthode et le modèle de route, la date UTC, le code HTTP et le résultat. Aucun en-tête, corps, paramètre URL, nom de client, message, mot de passe ou jeton n’est copié. Les tentatives de connexion refusées sont anonymes : l’identifiant soumis n’est pas journalisé. `X-Audit-Event-Id` permet de retrouver une écriture réussie. Une réussite HTTP ne prouve pas la livraison d’un message WhatsApp.

Les alertes du module regroupent au moins 5 échecs/refus par acteur et opération pendant les 10 dernières minutes, indépendamment des filtres. Les appels non authentifiés sont regroupés et ne permettent pas d’attribuer une tentative à une personne. Rafraîchissement : 30 secondes ; aucun envoi automatique de mail ou message. Conservation : 90 jours via index TTL MongoDB (suppression asynchrone).

Les routes applicatives ne permettent pas de modifier ou supprimer le journal. Une panne d’écriture ne bloque pas l’action métier : un message serveur fixe `AUDIT_WRITE_FAILED` et un indicateur dans le module signalent les lacunes possibles. Cet indicateur est local au processus et réinitialisé au redémarrage ; une supervision externe est nécessaire pour une alerte persistante en cas de panne MongoDB.

Tests : `npm run test:audit`, avec `TEST_ADMIN_LOGIN` et `TEST_ADMIN_PASSWORD` si les identifiants de configuration ont changé. Le test génère puis nettoie ses propres événements et son compte temporaire.

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

Le module Livraison est disponible sur `/livraison` après connexion. Il permet d'ajouter des livreurs, d'affecter une commande prête, d'enregistrer le départ et de confirmer la remise au client.
Les livreurs n'ont pas de compte dans l'application : le management les inscrit, conserve leur numéro WhatsApp et met à jour leur disponibilité. Seuls les livreurs disponibles peuvent être affectés.
Le centre Notifications est disponible sur `/notifications`. Il conserve l'historique des messages WhatsApp livreur/client, leur statut, l'heure d'envoi et permet une relance manuelle.
Les zones et tarifs de livraison sont gérés par le management sur `/livraison`. Les nouvelles commandes livrées utilisent une zone active et ajoutent automatiquement son tarif au total.

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

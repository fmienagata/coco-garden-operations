# Coco Garden — Cuisine & Livraison

Projet de gestion des commandes du restaurant, de la confirmation à la remise au client.

## État du projet

Version de démarrage : Next.js, React, TypeScript, page d'accueil et API de santé.
Les modules cuisine, livraison, dashboard, authentification et notifications sont à développer.
Cette version n'est pas prête à gérer des commandes réelles.

## Démarrer dans VS Code

Prérequis : Node.js 24 LTS, npm et Git.

```powershell
npm.cmd ci
npm.cmd run dev
```

Ouvrir http://localhost:3000. Vérification de santé : http://localhost:3000/api/health.
Les tâches VS Code sont disponibles via Terminal > Exécuter la tâche.

## Vérifier le projet

```powershell
npm.cmd run typecheck
npm.cmd run build
```

## Configuration future

Copier `.env.example` vers `.env.local` lorsque les services seront raccordés.
Ne jamais publier `.env.local`, les jetons WhatsApp ou les clés privées Supabase.
Aucun secret n'est nécessaire pour lancer le socle actuel.

## Structure

- `src/app` : interface et routes API.
- `docs/ARCHITECTURE.md` : architecture cible et règles métier.
- `.vscode` : réglages et tâches de développement.

La création du dépôt GitHub constitue une sauvegarde du code ; elle ne déploie pas l'application en production.

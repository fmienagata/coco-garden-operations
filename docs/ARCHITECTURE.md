# Coco Garden — architecture cible

## État actuel

Socle Next.js, TypeScript et MongoDB avec authentification du poste cuisine, tableau de préparation et commandes isolées par `restaurantId`.
Les montants sont des nombres entiers en XAF, affichés en FCFA. Chaque déploiement doit fournir un `RESTAURANT_ID` unique.

## Modules prévus

- Cuisine : tableau temps réel et actions par commande.
- Livraison : livreurs, affectations, prise en charge, départ et remise.
- Agent IA : API authentifiée avec validation serveur des actions.
- Notifications : file persistante, dédoublonnage et reprises contrôlées.
- Pilotage : commandes, ventes finalisées, encaissements et remboursements séparés.

## Compatibilité multi-restaurant

Toutes les données métier doivent porter un `restaurantId` et toutes les routes serveur doivent le dériver de la session, jamais du navigateur.
Les paramètres propres à un établissement (nom, devise, fuseau horaire, horaires, moyens de paiement et utilisateurs) doivent vivre dans `restaurant_settings`.
La devise par défaut du Congo est XAF/FCFA, sans décimales. La devise ne doit pas être codée dans les calculs métier afin de permettre l'ouverture à d'autres pays de la zone CEMAC.

## Règles métier à implémenter

Parcours livraison : CONFIRMÉE → EN_PRÉPARATION → PRÊTE → LIVREUR_AFFECTÉ → EN_LIVRAISON → LIVRÉE.
ANNULÉE nécessite un motif et les droits appropriés.
Propositions à valider : indicateur de retard indépendant du statut, et RETIRÉE pour la remise à emporter.

- PREPARATION_TIME vient du système ou de l'équipe, jamais de l'imagination de l'agent.
- Sans estimation disponible, aucun délai chiffré n'est envoyé.
- READY_AT, PICKUP_TIME et l'heure de départ sont enregistrés séparément.
- DRIVER_NAME, DRIVER_PHONE et DRIVER_ID restent internes par défaut.
- Le départ réel déclenche le message WhatsApp de mise en livraison.
- DELIVERY_ETA et NEW_ETA doivent avoir une source identifiée.
- Un retard ne déclenche jamais une livraison automatique.
- LIVRÉE nécessite une confirmation explicite et une source autorisée.
- Les changements de statut et les notifications à traiter sont enregistrés dans une même transaction.
- Chaque action conserve son auteur, sa source et son horodatage.
- Les droits cuisine, manager, livreur et agent IA sont vérifiés au serveur.
- Un échec d'envoi WhatsApp doit être visible et peut être relancé sans rejouer la transition métier.

## Infrastructure cible

PostgreSQL/Supabase pour les données, Auth pour les utilisateurs, Realtime pour les écrans.
API Next.js côté serveur et worker dédié aux notifications Meta WhatsApp Cloud API.
Tables prévues : orders, order_items, order_events, drivers, delivery_assignments, payments, notification_outbox et restaurant_settings.
Les clés privées restent exclusivement côté serveur. Les webhooks doivent être authentifiés et dédoublonnés.
Les rapports utilisent le fuseau horaire configuré du restaurant.

## Étapes de réalisation

1. Authentification, schéma SQL et droits d'accès.
2. API commandes, transitions et journal d'événements avec tests métier.
3. Tableau cuisine et suivi livraison.
4. Notifications WhatsApp et API agent IA.
5. Dashboard et recette complète avant utilisation en cuisine.

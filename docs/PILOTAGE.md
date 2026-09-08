# Module Pilotage

Accès : `/pilotage`, depuis l’accueil et la cuisine. L’accès utilise la session équipe existante, avec isolation par restaurant. L’application ne dispose pas encore de rôles manager distincts : tout membre connecté peut consulter et déclarer les opérations.

- Périodes : aujourd’hui, 7 derniers jours, mois en cours ou dates personnalisées (366 jours maximum).
- Journées : Africa/Brazzaville (Pointe-Noire).
- Commandes : date de création ; montant commandé hors annulations.
- Ventes brutes finalisées : date explicite de livraison ou retrait. Aucun délai ne finalise une vente.
- Encaissements : déclarations manuelles intégrales, horodatées avec l’utilisateur et le moyen de paiement.
- Remboursements : déclarations intégrales, motif obligatoire, date propre ; encaissements nets = reçus − remboursés.
- Aucun paiement bancaire ni message WhatsApp n’est exécuté par ce module.
- Sans déclaration : paiement « non renseigné ». Aucun état de livraison ne prouve un paiement.
- Pas de paiements partiels, réencaissements après remboursement ou corrections rétroactives dans cette version.
- Démonstrations exclues par défaut. Les filtres de statut, client, service et paiement affectent uniquement l’historique et son CSV.
- Export : toutes les lignes filtrées, pas seulement la page courante ; valeurs CSV protégées contre les formules.
- Collection `settlements` : identifiant unique restaurant/commande, écritures conditionnelles atomiques contre les doublons, utilisateur et horodatage conservés. Les statuts `collected` des commandes à emporter sont projetés dans les lectures depuis cette collection.
- Les ventes sans date de remise connue sont exclues du CA ; les commandes concernées créées dans la période produisent une alerte.
- Les montants affichés sont ceux des commandes : aucun frais de livraison ni taxe manquante n’est extrapolé.

## Validation

`npm.cmd run test:pilotage` : calculs, journées, dates manquantes, remboursements, CSV.
`npm.cmd run test:pilotage:api` : serveur local requis ; crée des fixtures explicitement marquées démo et supprime uniquement ses propres fixtures. Vérifie auth, isolation, doublons concurrents, encaissement, retrait et remboursement.
`npm.cmd run typecheck` et `npm.cmd run build`.

## Limite de volume

Cette première version calcule le rapport côté serveur sur l’historique du restaurant, sans troncature à 100 commandes. L’historique affiché est paginé par 20 lignes. Pour un volume important, remplacer cette lecture par des agrégations MongoDB indexées et une pagination serveur. Les routes de suppression refusent les commandes ayant un historique de pilotage. Les modifications de contenu sont également bloquées pour ces commandes ; après retrait, elles sont clôturées pour la cuisine.

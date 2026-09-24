# RAPPORT.md — Darkdeku225 AI Video

> Fichier de mémoire du projet. À mettre à jour après chaque étape importante.

## Objectif du projet

Bot Telegram professionnel, gratuit pour les utilisateurs, qui transforme une image envoyée par
l'utilisateur en vidéo animée à partir d'un prompt textuel, via l'API **Agnes AI**
(modèle `agnes-video-v2.0`). Accès conditionné à l'abonnement au canal `@Deku225_Master`.

## Stack et technologies

- Node.js (>=18, `fetch` natif utilisé pour les appels HTTP)
- `node-telegram-bot-api` (polling)
- `better-sqlite3` (SQLite synchrone)
- `dotenv`
- PM2 pour l'exécution en production

## Architecture et structure des fichiers

Voir `plan.md` pour le détail exhaustif. Résumé :

- `src/bot.js` : point d'entrée, branchement des handlers (message, callback_query, polling_error)
- `src/config.js` : configuration centrale (formats, durées, styles, .env)
- `src/database.js` : schéma SQLite auto-initialisé (7 tables)
- `src/handlers/` : `start.js`, `video.js` (machine à états du workflow), `help.js`, `support.js`, `admin.js`
- `src/services/` : `agnes.js` (couche d'abstraction API), `api-manager.js` (rotation des clés),
  `video-manager.js` (CRUD jobs + stats), `cooldown.js`, `membership.js`, `ads.js`, `support.js`
- `src/keyboards/` : `main.js`, `video.js`, `admin.js`
- `src/utils/` : `logger.js`, `helpers.js` (chiffrement AES-256-GCM, calcul num_frames), `session.js`
  (état de conversation par utilisateur, en mémoire, aucune variable globale partagée)

## Fonctionnalités développées

- [x] Workflow complet de création vidéo (machine à états : WAITING_IMAGE → WAITING_PROMPT →
      WAITING_FORMAT → WAITING_STYLE → WAITING_DURATION → CONFIRMATION → GENERATING)
- [x] Vérification réelle de l'abonnement au canal (getChatMember, statuts member/administrator/creator)
- [x] Rotation intelligente des clés API Agnes (round-robin, cooldown automatique sur 429/quota)
- [x] Chiffrement AES-256-GCM des clés Agnes stockées en SQLite, masquage à l'affichage
- [x] Cooldown individuel de 20 secondes, persisté en SQLite
- [x] Construction du prompt enrichi (prompt utilisateur + suffixe de style, sans destruction)
- [x] Format Auto basé sur les proportions réelles de l'image envoyée (largeur/hauteur Telegram)
- [x] Durée Auto = 5 secondes par défaut, respect strict de `num_frames = 8n+1` et `<= 441`
- [x] Récapitulatif avant génération + édition des paramètres sans recommencer
- [x] Polling Agnes avec intervalle raisonnable et nombre max de tentatives (timeout géré)
- [x] Gestion d'erreurs générique côté utilisateur, détail technique uniquement dans les logs
- [x] Panel admin : statistiques (utilisateurs + vidéos + API détaillé par clé)
- [x] Panel admin : gestion des clés API (ajout, suppression avec confirmation)
- [x] Panel admin : gestion des publicités (ajout via wizard texte, activer/désactiver, suppression,
      affichage périodique selon fréquence configurable)
- [x] Panel admin : gestion du Soutien (texte d'info + sites dynamiques, non codés en dur)
- [x] Aide utilisateur détaillée et professionnelle
- [x] Logs INFO/WARN/ERROR sans jamais logger de clé API complète
- [x] Structure PM2 (`ecosystem.config.js`) + scripts npm

## Fonctionnalités restantes / simplifications à améliorer plus tard

- Modification (edit) d'une publicité ou d'un site existant : actuellement il faut supprimer puis
  recréer (pas de wizard d'édition en place) — à améliorer si besoin.
- L'ajout d'une image à une publicité depuis le wizard texte n'est pas encore branché (le champ
  `image` existe en base et dans `AdsService`, mais le wizard actuel ne demande pas de photo) —
  prévoir un état `ADMIN_AD_WAITING_IMAGE` avec écoute d'un message photo si souhaité.
- Pas de file d'attente explicite (queue) pour la concurrence : chaque génération tourne dans sa
  propre promesse asynchrone ; suffisant pour un usage modéré, à surveiller en charge élevée.
- Pas de suppression automatique programmée des vieux fichiers dans `temp/` (nettoyage fait au cas
  par cas après chaque génération, mais pas de tâche de nettoyage périodique).

## Modifications importantes effectuées

- Version initiale complète livrée le 24/09/2026 (voir date du build), puis poussée sur GitHub
  (`Deku0019523f/darkdeku225-ai-video`, dépôt public).

## Problèmes rencontrés et solutions

- **Ambiguïté sur le format attendu par Agnes pour le champ `image`** : la doc fournie ne précise
  pas si Agnes attend une URL publique ou une image encodée en base64. Choix fait : téléchargement
  de l'image Telegram côté serveur puis envoi en `data:image/jpeg;base64,...`. Si Agnes attend en
  réalité une URL hébergée, il faudra adapter `handlePhoto()` (src/handlers/video.js) pour héberger
  l'image quelque part (ex: petit serveur statique ou stockage objet) et passer l'URL à la place.
- **Modèle Agnes retiré le 25/09/2026** : isolé entièrement dans `src/services/agnes.js` +
  `AGNES_MODEL` en `.env`, comme demandé, pour permettre une migration sans réécrire le bot.
- Création initiale du dépôt GitHub échouée via l'intégration connectée (403 « Resource not
  accessible by integration ») : le dépôt a été créé manuellement par Alec, puis le code a été
  poussé via push_files.
- Pas d'accès réseau dans l'environnement de build : les dépendances npm n'ont pas pu être
  installées ni testées en conditions réelles ici. Tous les fichiers ont été validés avec
  `node --check` (syntaxe correcte), mais un test d'exécution réel (`npm install && npm start`)
  reste à faire côté utilisateur.

## Dépendances installées

`better-sqlite3`, `dotenv`, `node-telegram-bot-api` (voir `package.json`). Non installées dans cet
environnement de build (pas d'accès réseau) — à faire avec `npm install` côté utilisateur.

## Commandes importantes

```bash
npm install
cp .env.example .env      # puis remplir les valeurs
npm start                 # lancement simple
pm2 start ecosystem.config.js   # lancement production
pm2 logs darkdeku225-ai-video
```

## Variables d'environnement nécessaires

Voir `.env.example` (aucune clé/mot de passe réel n'est stocké dans ce dépôt) :
`TELEGRAM_BOT_TOKEN`, `ADMIN_ID`, `REQUIRED_CHANNEL_USERNAME`, `REQUIRED_CHANNEL_LINK`,
`AGNES_MODEL`, `AGNES_BASE_URL`, `AGNES_CREATE_PATH`, `AGNES_RESULT_PATH`, `ENCRYPTION_KEY`,
`GENERATION_COOLDOWN_SECONDS`, `AGNES_POLL_INTERVAL_MS`, `AGNES_POLL_MAX_ATTEMPTS`,
`DATABASE_PATH`, `TEMP_DIR`.

## État actuel du projet

Code complet et cohérent livré, syntaxe validée (`node --check` sur tous les fichiers), poussé sur
GitHub (dépôt public `darkdeku225-ai-video`). Non testé en conditions réelles (pas d'accès réseau
dans l'environnement de build) : à tester par l'utilisateur avec un vrai token Telegram et de
vraies clés Agnes avant mise en production.

## Prochaines étapes à réaliser

1. Cloner le dépôt, `npm install` puis renseigner `.env` avec un vrai token et générer `ENCRYPTION_KEY`.
2. Ajouter au moins une clé Agnes via le panel admin (`👑 Admin > 🔑 API > ➕ Ajouter une clé`).
3. Vérifier que le bot est bien administrateur du canal `@Deku225_Master`.
4. Tester le workflow complet de bout en bout avec une vraie image et un vrai prompt.
5. Confirmer le format exact attendu par Agnes pour le champ `image` (URL vs base64) et ajuster si
   besoin (voir section "Problèmes rencontrés").
6. Configurer les sites de soutien et le texte d'information depuis le panel admin.

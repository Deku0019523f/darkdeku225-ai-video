# RAPPORT.md — Darkdeku225 AI Video

> Fichier de mémoire du projet. À mettre à jour après chaque étape importante.

## Objectif du projet

Telegram **Mini App** (pivot depuis un bot 100% chat) qui transforme une image envoyée
par l'utilisateur en vidéo animée à partir d'un prompt textuel, via l'API **Agnes AI**
(modèle `agnes-video-v2.0`). Accès conditionné à l'abonnement au canal `@Deku225_Master`.
Le panel admin est lui aussi en Mini App.

## Stack et technologies

- Node.js (>=18, `fetch` natif)
- `node-telegram-bot-api` (bot minimal, polling, juste `/start`)
- `express` (serveur HTTP : sert la Mini App + API REST)
- `better-sqlite3` (SQLite synchrone)
- `dotenv`
- Frontend : HTML/CSS/JS vanilla (pas de framework/bundler), SDK `telegram-web-app.js`
- PM2 pour l'exécution en production

## Architecture et structure des fichiers

Voir `plan.md` pour le détail exhaustif. Résumé du pivot Mini App :

- `src/index.js` : **nouveau point d'entrée unique** — initialise la DB, démarre le bot
  et le serveur Express dans le même process
- `src/bot.js` : **réduit au strict minimum** — configure le menu button Telegram
  (`web_app`) et répond à `/start` avec un bouton "Ouvrir" vers `WEBAPP_URL`
- `src/server.js` : serveur Express — sert `public/` (frontend statique) + monte
  `/api`, `/api/video`, `/api/admin`
- `src/webapp-auth.js` : **nouveau** — valide cryptographiquement `initData` (HMAC-SHA256,
  algorithme officiel Telegram), attache `req.telegramUser`, vérifie l'admin
- `src/routes/common.js`, `video.js`, `admin.js` : **nouveaux** — endpoints REST qui
  remplacent les anciens handlers de chat (`video.js`, `admin.js`, `help.js`, `support.js`
  ont été **supprimés**, ainsi que `keyboards/*` et `utils/session.js`, devenus inutiles)
- `src/services/video-workflow.js` : **nouveau** — extrait les fonctions pures
  (`buildFinalPrompt`, `resolveFormat`, `resolveDuration`) qui étaient auparavant dans le
  handler de chat, réutilisées par `routes/video.js`
- `src/services/video-manager.js` : **complété** — deux caches en mémoire (`progressCache`,
  `adCache`) exposés via `setProgress/getProgress/setAd/getAd`, consommés par
  `routes/video.js` pour le polling de job depuis la Mini App
- `src/services/*` (agnes, api-manager, cooldown, membership, ads, support) : **inchangés**
  — la bascule Mini App ne touche à aucune logique métier
- `public/index.html`, `app.js`, `styles.css` : **nouveau frontend** — toutes les vues
  dans un seul index.html (écrans togglés en JS), thème clair/sombre adaptatif via les
  CSS vars `--tg-theme-*`

## Fonctionnalités développées

- [x] Pivot complet chat → Mini App (décision utilisateur : `/start` ouvre uniquement la
      Mini App, plus de ReplyKeyboard/menu texte ; panel admin aussi en Mini App)
- [x] Authentification Telegram native via validation `initData` (HMAC-SHA256)
- [x] Écran d'accueil avec statut (abonnement, cooldown, disponibilité clés)
- [x] Wizard de création vidéo en Mini App : upload image (FileReader + aperçu),
      prompt, format (avec auto-détection via les dimensions réelles de l'image),
      style (optionnel), durée (optionnelle), récapitulatif, génération
- [x] Suivi de progression en direct (polling `/api/video/job/:id` toutes les 2,5s)
- [x] Vidéo affichée dans la Mini App (`<video>`) **et** renvoyée dans le chat Telegram
      via `bot.sendVideo()` pour persistance après fermeture de l'app
- [x] Panel admin en Mini App : onglets Statistiques / API / Ads / Soutien, avec
      ajout/suppression de clés, ajout/activation/désactivation/suppression de pubs et
      de sites de soutien
- [x] Toutes les vérifications de sécurité côté serveur (abonnement, cooldown, clé
      disponible, admin) — jamais fait confiance au seul affichage côté client
- [x] Gestion d'erreurs propre (codes HTTP dédiés : 403 abonnement requis, 429 cooldown,
      503 aucune clé, messages génériques côté utilisateur)
- [x] Statistiques admin étendues : taux de réussite et temps moyen de génération affichés
      dans l'onglet Statistiques de la Mini App (`avgPerUser`, `topStyles`, `topFormats`
      restent disponibles via `/api/admin/stats` mais pas encore affichés côté frontend)

## Fonctionnalités restantes / simplifications à améliorer plus tard

- Édition d'une publicité ou d'un site existant se fait encore via suppression +
  recréation côté logique (mais l'UI Mini App pourrait gagner un vrai formulaire d'édition
  inline plus tard).
- Pas de compression/redimensionnement de l'image côté client avant envoi en base64 —
  pour de grosses photos (>10 Mo), le payload JSON peut devenir lourd ; envisager de
  redimensionner via `<canvas>` côté frontend avant upload si ça pose problème en usage
  réel.
- Le lien "Créer une Mini App nommée" via `@BotFather` `/newapp` (accès direct
  `t.me/<bot>/<app>`) n'est pas automatisé — à faire manuellement une fois si souhaité,
  en plus du Menu Button déjà couvert par le code.
- Toujours en suspens depuis la V1 chat : confirmer le format exact attendu par Agnes
  pour le champ `image` (URL vs base64 — actuellement en base64 data URI).
- Toujours en suspens : modèle `agnes-video-v2.0` retiré le 25/09/2026, migration à
  faire vers un modèle successeur (voir échange précédent sur les limites de durée des
  modèles 2.5/2.5-flash, qui sont en réalité plus courtes que v2.0).
- L'écran admin "Statistiques" affiche maintenant le taux de réussite et le temps moyen
  de génération en plus des champs de base ; `avgPerUser`, `topStyles` et `topFormats`
  restent disponibles côté API (`/api/admin/stats`) mais pas encore affichés côté Mini
  App — à ajouter dans `loadAdminStats()` si souhaité.

## Modifications importantes effectuées

- Version initiale (bot 100% chat) livrée et poussée sur GitHub le 24/09/2026.
- **Pivot Mini App** : réécriture complète de la couche de présentation (chat →
  interface web intégrée), services métier conservés à l'identique. Fichiers de chat
  obsolètes supprimés (`handlers/video.js`, `handlers/admin.js`, `handlers/help.js`,
  `handlers/support.js`, `keyboards/*`, `utils/session.js`).
- Le pivot a été réalisé en deux temps (reprise après réinitialisation de
  l'environnement de build) : une première partie (suppression des fichiers obsolètes,
  `bot.js`, `config.js`, `index.js`, `handlers/start.js`) avait déjà été poussée sur
  GitHub ; cette session a complété le reste (`webapp-auth.js`, `server.js`,
  `routes/*`, `services/video-workflow.js`, cache progress/ad dans `video-manager.js`,
  tout le frontend `public/`, et les mises à jour `package.json`/`.env.example`/
  `ecosystem.config.js`/README/RAPPORT/plan).
- En parallèle de ce pivot, une autre session a apporté plusieurs correctifs à la
  version V1 (chat) avant sa suppression : passage à un ReplyKeyboard, diffusion des
  publicités, affichage HTML/graphiques en barres des statistiques, correctifs de
  proportion d'image, échappement Markdown. Ces correctifs n'ont plus d'effet une fois
  le chat remplacé par la Mini App, mais deux ajouts utiles qu'ils contenaient ont été
  conservés et sont toujours actifs : les champs statistiques étendus de
  `VideoManager.getStats()` (`successRate`, `avgPerUser`, `avgGenerationSeconds`,
  `topStyles`, `topFormats`, exposés via `/api/admin/stats`) et les fonctions utilitaires
  `escapeMarkdown`/`escapeHtml`/`sendMarkdownSafe` dans `src/utils/helpers.js` — ces
  trois dernières ne sont plus appelées nulle part après la suppression des handlers de
  chat ; elles sont laissées en place (code mort, sans risque) plutôt que supprimées
  unilatéralement, à nettoyer plus tard si confirmé inutile.

## Problèmes rencontrés et solutions

- **Progression numérique et publicités non persistées en base** : le schéma SQLite
  `video_jobs` n'a pas de colonne `progress`, et les pubs étaient choisies à la volée
  dans le handler de chat. Solution : deux caches en mémoire dans
  `src/services/video-manager.js` (`progressCache`, `adCache`), suffisants puisque ces
  données sont éphémères (le temps que la Mini App poll le job), sans toucher au schéma.
- **Sécurité initData** : implémentation stricte de l'algorithme officiel Telegram
  (tri des clés, HMAC-SHA256 en deux passes, vérification de fraîcheur via `auth_date`)
  dans `src/webapp-auth.js`, plutôt qu'une vérification approximative.
- **Réinitialisation de l'environnement de build en cours de pivot** : une partie du
  travail (fichiers serveur/routes/frontend) avait été écrite mais pas encore poussée
  sur GitHub lorsque l'environnement local a été recyclé. Solution : le dépôt GitHub a
  été reclôné pour repartir de l'état réellement poussé, et les fichiers manquants ont
  été réécrits à l'identique à partir du contenu déjà connu, plutôt que de supposer leur
  présence. Leçon retenue : pousser sur GitHub au fur et à mesure plutôt qu'en un seul
  lot en fin de tâche, pour limiter la perte de travail en cas de redémarrage.
- Pas d'accès réseau dans l'environnement de build : dépendances npm non installées ni
  testées en conditions réelles ici (idem pour la V1). Tous les fichiers validés avec
  `node --check`.

## Dépendances installées

`better-sqlite3`, `dotenv`, `express`, `node-telegram-bot-api` (voir `package.json`).
Non installées dans cet environnement de build (pas d'accès réseau) — `npm install`
côté utilisateur.

## Commandes importantes

```bash
npm install
cp .env.example .env      # puis remplir les valeurs, notamment WEBAPP_URL (HTTPS)
npm start                 # lancement simple (bot + serveur dans le même process)
pm2 start ecosystem.config.js   # lancement production
pm2 logs darkdeku225-ai-video
```

## Variables d'environnement nécessaires

Voir `.env.example` : `TELEGRAM_BOT_TOKEN`, `ADMIN_ID`, `REQUIRED_CHANNEL_USERNAME`,
`REQUIRED_CHANNEL_LINK`, **`WEBAPP_URL`** (nouveau, HTTPS obligatoire), **`PORT`**
(nouveau), **`WEBAPP_INITDATA_MAX_AGE`** (nouveau), `AGNES_MODEL`, `AGNES_BASE_URL`,
`AGNES_CREATE_PATH`, `AGNES_RESULT_PATH`, `ENCRYPTION_KEY`, `GENERATION_COOLDOWN_SECONDS`,
`AGNES_POLL_INTERVAL_MS`, `AGNES_POLL_MAX_ATTEMPTS`, `DATABASE_PATH`, `TEMP_DIR` (plus
vraiment utilisé côté Mini App, conservé pour compatibilité).

## État actuel du projet

Pivot Mini App complet et cohérent, syntaxe validée (`node --check` sur tous les
fichiers JS, backend et frontend), **et intégralement poussé sur GitHub**
(`Deku0019523f/darkdeku225-ai-video`, branche `main`). Non testé en conditions réelles
(pas d'accès réseau dans l'environnement de build, et un vrai domaine HTTPS + BotFather
sont nécessaires pour tester une Mini App) : à tester par l'utilisateur, qui a confirmé
avoir déjà un domaine + HTTPS prêts sur son VPS.

## Prochaines étapes à réaliser

1. `npm install`, renseigner `.env` (notamment `WEBAPP_URL` avec le domaine HTTPS déjà
   prêt) et générer `ENCRYPTION_KEY`.
2. Mettre le reverse-proxy (nginx/Caddy) en place devant `PORT` pour exposer `WEBAPP_URL`
   en HTTPS valide.
3. Dans BotFather : `/mybots` → Bot Settings → Menu Button → coller `WEBAPP_URL`.
4. Lancer le bot (`npm start` ou PM2), ouvrir `/start` dans Telegram et vérifier que le
   bouton "Ouvrir" lance bien la Mini App.
5. Ajouter au moins une clé Agnes depuis l'onglet 🔑 API du panel admin de la Mini App.
6. Vérifier que le bot est bien administrateur du canal `@Deku225_Master`.
7. Tester le workflow complet de bout en bout (image, prompt, génération, réception de
   la vidéo dans la Mini App et dans le chat).
8. Configurer les sites de soutien et le texte d'information depuis l'onglet 🤝 Soutien.
9. (Optionnel) Afficher `avgPerUser`, `topStyles`, `topFormats` dans l'écran admin de la
   Mini App, en plus de `successRate`/`avgGenerationSeconds` déjà affichés.

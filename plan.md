# plan.md — Structure détaillée du projet

```
darkdeku225-ai-video/
│
├── public/                         # Frontend de la Mini App (statique, servi par Express)
│   ├── index.html                  # Toutes les vues (écrans togglés en CSS/JS) : accueil,
│   │                                  abonnement requis, wizard vidéo, génération, résultat,
│   │                                  erreur, aide, soutien, admin (4 onglets)
│   ├── app.js                       # Navigation entre écrans, thème Telegram clair/sombre,
│   │                                  appels API (fetch + en-tête X-Telegram-Init-Data),
│   │                                  wizard de création vidéo, polling de job, panel admin
│   └── styles.css                   # Thème adaptatif via les CSS vars --tg-theme-*
│
├── src/
│   ├── index.js                    # Point d'entrée unique : initialise la DB, démarre le bot
│   │                                  et le serveur Express dans le même process
│   ├── bot.js                       # Bot Telegram minimal : menu button (web_app) + /start
│   │                                  qui ouvre la Mini App
│   ├── server.js                    # Serveur Express : sert public/ + monte /api, /api/video,
│   │                                  /api/admin derrière les middlewares d'authentification
│   ├── webapp-auth.js               # Validation cryptographique de initData (HMAC-SHA256,
│   │                                  algorithme officiel Telegram) ; requireTelegramAuth et
│   │                                  requireAdmin
│   ├── config.js                    # Charge .env, expose formats/durées/styles/limites +
│   │                                  config.webapp (url, port, initDataMaxAgeSeconds)
│   ├── database.js                  # Ouvre SQLite (WAL), crée les 7 tables si absentes
│   │
│   ├── routes/                      # Endpoints REST consommés par public/app.js
│   │   ├── common.js                # GET /api/status, /api/membership, /api/support
│   │   ├── video.js                 # POST /api/video/generate, GET /api/video/job/:id
│   │   │                              (vérifie abonnement, cooldown, clé dispo ; lance la
│   │   │                              génération en tâche de fond ; renvoie aussi la vidéo
│   │   │                              dans le chat Telegram via bot.sendVideo)
│   │   └── admin.js                  # /api/admin/* : stats, CRUD clés API (masquées),
│   │                                   CRUD publicités, CRUD sites de soutien
│   │
│   ├── handlers/
│   │   └── start.js                 # upsertUser / touchLastSeen (SQLite), consommés par
│   │                                   routes/common.js à chaque requête authentifiée
│   │
│   ├── services/
│   │   ├── agnes.js                 # SEULE couche qui parle à l'API Agnes (création + polling)
│   │   ├── api-manager.js           # ApiKeyManager : CRUD clés, rotation, cooldown, stats
│   │   ├── video-manager.js         # CRUD video_jobs, orchestration agnes.js, stats admin
│   │   │                              étendues (successRate, avgPerUser, avgGenerationSeconds,
│   │   │                              topStyles, topFormats) + caches en mémoire progress/ad
│   │   │                              (progressCache, adCache) pour le polling Mini App
│   │   ├── video-workflow.js         # Fonctions pures : buildFinalPrompt, resolveFormat,
│   │   │                              resolveDuration — réutilisées par routes/video.js
│   │   ├── membership.js             # Vérification réelle getChatMember
│   │   ├── cooldown.js               # Cooldown individuel 20s persisté en SQLite
│   │   ├── ads.js                    # CRUD publicités + sélection + fréquence
│   │   └── support.js                # CRUD sites de soutien + texte d'info
│   │
│   └── utils/
│       ├── logger.js                 # Logs INFO/WARN/ERROR (console + fichier logs/bot.log)
│       ├── helpers.js                 # maskKey, encrypt/decrypt (AES-256-GCM), framesForSeconds,
│       │                               sleep, formatDate, safeUserLabel. Contient aussi
│       │                               escapeMarkdown/escapeHtml/sendMarkdownSafe, hérités de la
│       │                               V1 chat et non appelés depuis le pivot Mini App (code mort
│       │                               laissé en place, à nettoyer si confirmé inutile)
│       └── session.js                 # SUPPRIMÉ lors du pivot Mini App (les sessions de workflow
│                                        vivent désormais côté client, dans public/app.js)
│
├── data/
│   └── bot.sqlite                   # Créé automatiquement au premier lancement
│
├── temp/                            # Dossier conservé pour compatibilité (plus vraiment utilisé
│                                       côté Mini App, l'image transite en base64 directement)
│
├── logs/                            # Logs fichier (créé automatiquement)
│
├── .env.example                     # Modèle de configuration (aucun secret réel), inclut
│                                       WEBAPP_URL / PORT / WEBAPP_INITDATA_MAX_AGE
├── .gitignore
├── ecosystem.config.js              # PM2 : script src/index.js
├── package.json                     # main: src/index.js, dépendances incluant express
├── README.md
├── RAPPORT.md
└── plan.md
```

## Fichiers supprimés lors du pivot chat → Mini App

`handlers/video.js`, `handlers/admin.js`, `handlers/help.js`, `handlers/support.js`,
`keyboards/main.js`, `keyboards/video.js`, `keyboards/admin.js`, `utils/session.js` — toute
la logique de présentation en chat (machine à états, claviers inline/reply, callback_data) a
été remplacée par les routes REST (`src/routes/*`) et le frontend (`public/*`). Les services
métier listés ci-dessus n'ont pas été touchés.

## Schéma des tables SQLite

- **users** : id, telegram_id, username, first_name, is_admin, is_channel_member, created_at, last_seen_at
- **api_keys** : id, encrypted_key, masked_key, status (active/limited/disabled), usage_count,
  success_count, error_count, rate_limit_count, last_used_at, disabled_until, created_at
- **video_jobs** : id, telegram_user_id, api_key_id, prompt, style, format, duration, width, height,
  num_frames, frame_rate, agnes_video_id, agnes_task_id, status, video_url, error_message,
  created_at, completed_at
- **cooldowns** : telegram_user_id (PK), expires_at
- **ads** : id, image, message, button_text, url, active, display_count, created_at
- **support_sites** : id, name, description, url, button_text, position, active, created_at
- **settings** : key (PK), value — utilisé pour `support_info` (texte du menu Soutien) et
  `ads_frequency` (une pub tous les N générations réussies)

> La progression numérique (%) et la publicité choisie pour un job en cours ne sont pas dans
> ce schéma : elles vivent uniquement dans les caches en mémoire `progressCache`/`adCache` de
> `video-manager.js`, car elles sont éphémères (utiles seulement le temps que la Mini App poll
> le job) et ne justifient pas une migration de schéma.

## Endpoints REST de la Mini App

| Méthode / chemin                  | Authentification        | Rôle                                           |
|------------------------------------|--------------------------|-------------------------------------------------|
| GET `/api/status`                  | requireTelegramAuth      | Statut global (abonnement, cooldown, clés, admin) |
| GET `/api/membership`              | requireTelegramAuth      | Revérifie l'abonnement (bouton "Vérifier")       |
| GET `/api/support`                 | requireTelegramAuth      | Texte d'info + sites de soutien actifs           |
| POST `/api/video/generate`         | requireTelegramAuth      | Lance une génération (403/429/503 si bloqué)     |
| GET `/api/video/job/:id`           | requireTelegramAuth      | Statut/progression/résultat d'un job (polling)   |
| GET `/api/admin/stats`             | requireTelegramAuth + Admin | Statistiques vidéos + clés API                |
| GET/POST/DELETE `/api/admin/keys`  | requireTelegramAuth + Admin | CRUD clés API Agnes (toujours masquées)       |
| GET/POST/PATCH/DELETE `/api/admin/ads` | requireTelegramAuth + Admin | CRUD publicités                          |
| GET `/api/admin/support`, PUT `/support/info`, POST/PATCH/DELETE `/support/sites` | requireTelegramAuth + Admin | Gestion du Soutien |

## Points d'extension prévus

- Changer de modèle Agnes : `AGNES_MODEL` en `.env` + éventuellement `buildCreatePayload()` /
  `fetchVideoResult()` dans `src/services/agnes.js`.
- Ajouter un système de crédits/paiement plus tard : brancher sur `routes/video.js` juste avant
  `VideoManager.createJob()`, sans toucher au reste du workflow.
- Édition complète des ads/sites existants (actuellement suppression + recréation côté logique) :
  ajouter un vrai formulaire d'édition inline dans `public/app.js` plutôt que des états serveur.
- Afficher `avgPerUser`, `topStyles`, `topFormats` (déjà renvoyés par `/api/admin/stats`) dans
  l'écran admin de la Mini App, en plus de `successRate`/`avgGenerationSeconds` déjà affichés.

# Darkdeku225 AI Video

Telegram **Mini App** qui transforme une image + un prompt en vidéo animée via l'API
**Agnes AI** (modèle `agnes-video-v2.0`, remplaçable facilement).

> Le bot Telegram lui-même ne fait plus qu'ouvrir la Mini App via `/start` — tout le
> workflow (création vidéo, aide, soutien, **et le panel admin**) se passe dans
> l'interface web intégrée à Telegram.

## Fonctionnalités

- Workflow complet en Mini App : image → prompt → format → style (optionnel) → durée (optionnelle) → récapitulatif → génération, avec suivi de progression en direct
- Authentification Telegram native (validation cryptographique de `initData`, aucun mot de passe)
- Vérification réelle de l'abonnement au canal Telegram obligatoire
- Rotation intelligente de plusieurs clés API Agnes, avec mise en cooldown automatique des clés en limite (429/quota)
- Cooldown individuel de 20 secondes par utilisateur, persisté en SQLite
- **Panel administrateur complet en Mini App** (statistiques, gestion des clés API, publicités, sites de soutien) — accès réservé à l'admin (vérifié côté serveur, pas seulement côté interface)
- La vidéo générée est affichée directement dans la Mini App **et** renvoyée dans le chat Telegram pour rester accessible après fermeture
- Thème adaptatif (couleurs Telegram clair/sombre appliquées automatiquement)

## Architecture

```
Utilisateur → /start (bot) → bouton "Ouvrir" → Mini App (HTTPS)
                                                    │
                                        public/index.html + app.js
                                                    │ fetch + X-Telegram-Init-Data
                                                    ▼
                                    src/server.js (Express) + src/routes/*
                                                    │
                                    src/services/* (agnes, api-manager, video-manager...)
                                                    │
                                              SQLite (data/bot.sqlite)
```

Le bot Telegram (`src/bot.js`) et le serveur web (`src/server.js`) tournent dans le
**même process Node** (`src/index.js`), pratique pour PM2 et pour que le serveur puisse
utiliser l'instance du bot (envoi de la vidéo dans le chat, vérification d'abonnement).

## Installation

```bash
git clone <votre-repo> darkdeku225-ai-video
cd darkdeku225-ai-video
npm install
cp .env.example .env
```

Remplissez `.env` :

```env
TELEGRAM_BOT_TOKEN=votre_token_botfather
ADMIN_ID=1299831974
REQUIRED_CHANNEL_USERNAME=Deku225_Master
REQUIRED_CHANNEL_LINK=https://t.me/Deku225_Master
WEBAPP_URL=https://votre-domaine.tld
PORT=3000
AGNES_MODEL=agnes-video-v2.0
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

> ⚠️ `WEBAPP_URL` doit être une URL **HTTPS publique** valide (certificat valide,
> pas auto-signé) — c'est une exigence stricte de Telegram pour les Mini Apps.
> Mettez un reverse-proxy (nginx, Caddy) devant le port `PORT` pour gérer le TLS.
>
> ⚠️ Le bot doit être **administrateur du canal** `@Deku225_Master` pour pouvoir
> vérifier l'abonnement des utilisateurs via `getChatMember`.

Les clés API Agnes s'ajoutent depuis le panel admin de la Mini App (onglet 🔑 API),
stockées chiffrées (AES-256-GCM) en SQLite grâce à `ENCRYPTION_KEY`.

### Déclarer la Mini App auprès de BotFather (une seule fois)

Dans la conversation avec **@BotFather** :
1. `/mybots` → sélectionnez votre bot → **Bot Settings** → **Menu Button** → collez `WEBAPP_URL`.
2. (Optionnel) `/newapp` pour aussi déclarer une Mini App nommée, utilisable via un lien direct `t.me/<bot>/<appname>`.

## Lancer le bot

```bash
npm start
```

## Lancer avec PM2 (production)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 logs darkdeku225-ai-video
```

## Structure du projet

```
darkdeku225-ai-video/
├── public/                 # Frontend de la Mini App (statique, servi par Express)
│   ├── index.html          # Toutes les vues (écrans togglés en CSS/JS)
│   ├── app.js               # Logique : navigation, workflow vidéo, admin, appels API
│   └── styles.css           # Thème adaptatif Telegram (clair/sombre)
├── src/
│   ├── index.js             # Point d'entrée unique : DB + bot + serveur HTTP
│   ├── bot.js                # Bot Telegram minimal (/start → ouvre la Mini App)
│   ├── server.js             # Serveur Express : sert public/ + monte les routes API
│   ├── webapp-auth.js        # Validation cryptographique de initData (HMAC-SHA256)
│   ├── config.js             # Configuration centrale (.env)
│   ├── database.js           # Schéma SQLite (auto-initialisé)
│   ├── routes/                # Endpoints API REST
│   │   ├── common.js          # /api/status, /api/membership, /api/support
│   │   ├── video.js           # /api/video/generate, /api/video/job/:id
│   │   └── admin.js           # /api/admin/* (stats, clés, ads, soutien)
│   ├── handlers/
│   │   └── start.js           # upsertUser / touchLastSeen (SQLite)
│   ├── services/               # Logique métier (inchangée, indépendante du transport)
│   │   ├── agnes.js            # Couche d'abstraction unique vers l'API Agnes
│   │   ├── api-manager.js      # Rotation et cooldown des clés Agnes
│   │   ├── video-manager.js    # CRUD jobs vidéo + orchestration + stats
│   │   ├── video-workflow.js   # Fonctions pures (prompt enrichi, résolution format/durée)
│   │   ├── cooldown.js, membership.js, ads.js, support.js
│   └── utils/
│       ├── logger.js, helpers.js (chiffrement AES-256-GCM, calcul num_frames)
├── data/bot.sqlite          # Base de données (créée automatiquement)
├── .env.example
├── ecosystem.config.js
└── package.json
```

## Sécurité

- Chaque requête API est authentifiée via `X-Telegram-Init-Data`, validée côté serveur
  par signature HMAC-SHA256 avec le token du bot (algorithme officiel Telegram) — un
  utilisateur ne peut pas se faire passer pour un autre ni pour l'admin
- Les routes `/api/admin/*` vérifient en plus que `telegram_id === ADMIN_ID` côté serveur
- Les clés Agnes ne sont jamais envoyées au frontend (masquage systématique), chiffrées
  en base (AES-256-GCM)
- `.env` et `data/*.sqlite` exclus de git via `.gitignore`

## Faire évoluer le modèle Agnes

Tout appel à Agnes passe exclusivement par `src/services/agnes.js`. Changez
`AGNES_MODEL` dans `.env` ; si la forme des paramètres change, adaptez uniquement
`buildCreatePayload()` / `fetchVideoResult()` dans ce fichier.

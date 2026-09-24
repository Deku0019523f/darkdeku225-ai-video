# Darkdeku225 AI Video

Bot Telegram professionnel de génération de vidéos par IA : transforme une image + un prompt
en vidéo animée via l'API **Agnes AI** (modèle `agnes-video-v2.0`, remplacable facilement).

## Fonctionnalités

- Workflow complet image → prompt → format → style (optionnel) → durée (optionnelle) → récapitulatif → génération
- Vérification réelle de l'abonnement au canal Telegram obligatoire (pas seulement un clic de bouton)
- Rotation intelligente de plusieurs clés API Agnes, avec mise en cooldown automatique des clés en limite (429/quota)
- Cooldown individuel de 20 secondes par utilisateur, persisté en SQLite (résiste aux redémarrages)
- Panel administrateur complet (statistiques, gestion des clés API, publicités, sites de soutien)
- Gestion d'erreurs propre : aucun détail technique n'est montré à l'utilisateur final
- Architecture multi-utilisateurs : chaque conversation a son propre état, aucune variable globale partagée

## Installation

```bash
git clone <votre-repo> darkdeku225-ai-video
cd darkdeku225-ai-video
npm install
cp .env.example .env
```

Remplissez ensuite `.env` :

```env
TELEGRAM_BOT_TOKEN=votre_token_botfather
ADMIN_ID=1299831974
REQUIRED_CHANNEL_USERNAME=Deku225_Master
REQUIRED_CHANNEL_LINK=https://t.me/Deku225_Master
AGNES_MODEL=agnes-video-v2.0
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

> ⚠️ Le bot doit être **administrateur du canal** `@Deku225_Master` pour pouvoir vérifier
> l'abonnement des utilisateurs via `getChatMember`.

Les clés API Agnes elles-mêmes ne se mettent **pas** dans `.env` : elles s'ajoutent depuis le
panel admin Telegram (`👑 Admin > 🔑 API > ➕ Ajouter une clé`), et sont stockées chiffrées
(AES-256-GCM) dans SQLite grâce à `ENCRYPTION_KEY`.

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

ou directement :

```bash
pm2 start src/bot.js --name darkdeku225-ai-video
```

## Structure du projet

```
darkdeku225-ai-video/
├── src/
│   ├── bot.js              # point d'entrée, branchement des handlers
│   ├── config.js           # configuration centrale (.env)
│   ├── database.js         # schéma SQLite (auto-initialisé)
│   ├── handlers/           # logique par fonctionnalité (start, video, help, support, admin)
│   ├── services/           # agnes.js, api-manager.js, video-manager.js, cooldown.js, membership.js, ads.js, support.js
│   ├── keyboards/          # claviers Telegram (main, video, admin)
│   └── utils/               # logger, helpers (chiffrement, frames...), session (état par utilisateur)
├── data/bot.sqlite         # base de données (créée automatiquement)
├── temp/                   # images téléchargées temporairement
├── .env.example
├── ecosystem.config.js
└── package.json
```

## Faire évoluer le modèle Agnes

Tout appel à Agnes passe exclusivement par `src/services/agnes.js`. Pour migrer vers un nouveau
modèle (ex. `agnes-video-v2.5`) :

1. Changez `AGNES_MODEL` dans `.env`.
2. Si la forme des paramètres change, adaptez uniquement `buildCreatePayload()` et
   `fetchVideoResult()` dans `src/services/agnes.js`.

Aucun autre fichier ne référence le nom du modèle.

## Base de données

Tables SQLite créées automatiquement au premier lancement : `users`, `api_keys`, `video_jobs`,
`cooldowns`, `ads`, `support_sites`, `settings`. Voir `RAPPORT.md` et `plan.md` pour le détail.

## Sécurité

- Les clés Agnes ne sont jamais affichées en clair dans Telegram (masquage `••••XXXX`)
- Les clés sont chiffrées en base (AES-256-GCM)
- Aucune clé, aucun `.env`, aucune erreur technique détaillée n'est exposée à l'utilisateur
- `.env` et `data/*.sqlite` sont exclus de git via `.gitignore`

## Support

Admin unique (Telegram ID configuré dans `ADMIN_ID`). Menu `👑 Admin` visible uniquement pour lui.

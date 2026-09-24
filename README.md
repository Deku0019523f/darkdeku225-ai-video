# Darkdeku225 AI Video

Bot Telegram professionnel de génération de vidéos par IA : transforme une image + un prompt
en vidéo animée via l'API **Agnes AI** (modèle `agnes-video-v2.0`, remplaçable facilement).

## Fonctionnalités

- Workflow complet image → prompt → format → style (optionnel) → durée (optionnelle) → récapitulatif → génération
- Récapitulatif avant génération, avec possibilité de modifier les paramètres sans tout recommencer
- Vérification réelle de l'abonnement au canal Telegram obligatoire (pas seulement un clic de bouton)
- Rotation intelligente de plusieurs clés API Agnes, avec mise en cooldown automatique des clés en limite (429/quota)
- Cooldown individuel de 20 secondes par utilisateur, persisté en SQLite (résiste aux redémarrages)
- Panel administrateur complet (statistiques, gestion des clés API, publicités, sites de soutien)
- Gestion d'erreurs propre : aucun détail technique n'est montré à l'utilisateur final
- Architecture multi-utilisateurs : chaque conversation a son propre état, aucune variable globale partagée

## Prérequis

- Node.js **18 ou plus** (le `fetch` natif est utilisé pour les appels HTTP)
- Un bot Telegram créé via [@BotFather](https://t.me/BotFather)
- Au moins une clé API Agnes AI
- Le bot doit être **administrateur du canal** obligatoire

## Installation

```bash
git clone https://github.com/Deku0019523f/darkdeku225-ai-video.git
cd darkdeku225-ai-video
npm install
cp .env.example .env
```

Remplissez ensuite `.env` (voir la liste complète des variables plus bas) :

```env
TELEGRAM_BOT_TOKEN=votre_token_botfather
ADMIN_ID=votre_id_telegram_numerique
REQUIRED_CHANNEL_USERNAME=Deku225_Master
REQUIRED_CHANNEL_LINK=https://t.me/Deku225_Master
AGNES_MODEL=agnes-video-v2.0
ENCRYPTION_KEY=une_valeur_aleatoire_forte
```

Générez `ENCRYPTION_KEY` avec :

```bash
openssl rand -hex 32
```

> ⚠️ Le bot doit être **administrateur du canal** `@Deku225_Master` pour pouvoir vérifier
> l'abonnement des utilisateurs via `getChatMember`.

Les clés API Agnes elles-mêmes ne se mettent **pas** dans `.env` : elles s'ajoutent depuis le
panel admin Telegram (`👑 Admin > 🔑 API > ➕ Ajouter une clé`), et sont stockées chiffrées
(AES-256-GCM) dans SQLite grâce à `ENCRYPTION_KEY`.

> Le bot refuse de démarrer si `TELEGRAM_BOT_TOKEN` ou `ENCRYPTION_KEY` est manquant.

## Variables d'environnement

| Variable | Rôle | Valeur par défaut (`.env.example`) |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token du bot (BotFather) | — |
| `ADMIN_ID` | ID Telegram numérique de l'administrateur unique | — |
| `REQUIRED_CHANNEL_USERNAME` | Canal obligatoire (sans `@`), utilisé pour `getChatMember` | `Deku225_Master` |
| `REQUIRED_CHANNEL_LINK` | Lien d'invitation affiché aux utilisateurs | `https://t.me/Deku225_Master` |
| `AGNES_MODEL` | Modèle vidéo Agnes actif | `agnes-video-v2.0` |
| `AGNES_BASE_URL` | URL de base de l'API Agnes | `https://apihub.agnes-ai.com` |
| `AGNES_CREATE_PATH` | Route de création d'une vidéo | `/v1/videos` |
| `AGNES_RESULT_PATH` | Route de récupération du résultat | `/agnesapi` |
| `ENCRYPTION_KEY` | Clé de chiffrement des clés Agnes en base | — |
| `GENERATION_COOLDOWN_SECONDS` | Cooldown entre deux générations, par utilisateur | `20` |
| `AGNES_POLL_INTERVAL_MS` | Intervalle de polling Agnes | `4000` |
| `AGNES_POLL_MAX_ATTEMPTS` | Nombre max de tentatives de polling | `150` |
| `DATABASE_PATH` | Chemin de la base SQLite | `./data/bot.sqlite` |
| `TEMP_DIR` | Dossier des fichiers temporaires | `./temp` |

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

Des raccourcis npm existent aussi : `npm run pm2:start`, `pm2:restart`, `pm2:logs`, `pm2:stop`.

## Utilisation

### Côté utilisateur

Menu principal : `🎬 Créer une vidéo`, `ℹ️ Aide`, `🤝 Soutien`.

Le workflow de création suit une machine à états par utilisateur :
`WAITING_IMAGE → WAITING_PROMPT → WAITING_FORMAT → WAITING_STYLE → WAITING_DURATION → CONFIRMATION → GENERATING`.

- **Format** : `Auto` se base sur les proportions réelles de l'image envoyée.
- **Durée** : `Auto` = 5 secondes ; le nombre d'images respecte `num_frames = 8n+1` et `<= 441`.
- **Style** : ajouté au prompt sous forme de suffixe, sans modifier le texte de l'utilisateur.

### Panel administrateur (`👑 Admin`, réservé à `ADMIN_ID`)

Le menu `👑 Admin` n'apparaît que pour l'administrateur ; toutes ses actions (messages texte et
boutons) sont ignorées pour les autres utilisateurs. Il est implémenté dans `src/handlers/admin.js`.

- **📊 Statistiques** : utilisateurs (total, nouveaux, actifs jour/semaine/mois), vidéos
  (total, jour/semaine/mois, réussies, échouées, en cours) et clés API (total, disponibles,
  limitées, désactivées).
- **🔑 API** : statistiques détaillées par clé (utilisations, succès, erreurs, limites, dernière
  utilisation), ajout d'une clé, suppression avec confirmation. Les clés sont toujours affichées
  masquées.
- **📢 Publicités** : création guidée (message → texte du bouton → lien), liste, activation /
  désactivation, suppression. Les publicités actives sont affichées périodiquement selon une
  fréquence configurable.
- **🤝 Soutien** : texte d'information et sites de soutien dynamiques (nom, description, URL,
  texte du bouton), activation / désactivation, suppression.

> La modification en place d'une publicité ou d'un site n'est pas encore disponible : il faut
> supprimer puis recréer l'élément.

## Structure du projet

```
darkdeku225-ai-video/
├── src/
│   ├── bot.js              # point d'entrée, branchement des handlers
│   ├── config.js           # configuration centrale (.env)
│   ├── database.js         # schéma SQLite (auto-initialisé)
│   ├── handlers/           # start, video (workflow), help, support, admin (panel admin)
│   ├── services/           # agnes.js, api-manager.js, video-manager.js, cooldown.js, membership.js, ads.js, support.js
│   ├── keyboards/          # claviers Telegram (main, video, admin)
│   └── utils/              # logger, helpers (chiffrement, frames...), session (état par utilisateur)
├── data/bot.sqlite         # base de données (créée automatiquement, ignorée par git)
├── temp/                   # images téléchargées temporairement
├── .env.example
├── ecosystem.config.js
├── package.json
├── plan.md                 # plan détaillé du projet
└── RAPPORT.md              # fichier de mémoire / suivi du projet
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
- Les logs ne contiennent jamais de clé API complète
- `.env` et `data/*.sqlite` sont exclus de git via `.gitignore`

## Limites connues

- Le format exact attendu par Agnes pour le champ `image` (URL publique ou base64) reste à
  confirmer : l'image est actuellement envoyée en `data:image/jpeg;base64,...`.
- Pas de file d'attente explicite : chaque génération tourne dans sa propre promesse asynchrone
  (suffisant pour un usage modéré).
- Pas de nettoyage périodique du dossier `temp/` (nettoyage fait après chaque génération).
- Le projet n'a pas encore été testé en conditions réelles avec un vrai token et de vraies clés.

## Support

Admin unique (Telegram ID configuré dans `ADMIN_ID`). Menu `👑 Admin` visible uniquement pour lui.

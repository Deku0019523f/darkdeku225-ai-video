# plan.md — Structure détaillée du projet

```
darkdeku225-ai-video/
│
├── src/
│   ├── bot.js                     # Point d'entrée : instancie TelegramBot, branche
│   │                                 message/callback_query/polling_error
│   ├── config.js                  # Charge .env, expose formats/durées/styles/limites
│   ├── database.js                # Ouvre SQLite (WAL), crée les 7 tables si absentes
│   │
│   ├── handlers/
│   │   ├── start.js               # /start, upsert utilisateur, menu principal
│   │   ├── video.js                # Machine à états du workflow de création vidéo
│   │   │                             (WAITING_IMAGE, WAITING_PROMPT, WAITING_FORMAT,
│   │   │                              WAITING_STYLE, WAITING_DURATION, CONFIRMATION,
│   │   │                              GENERATING) + génération finale + affichage ads
│   │   ├── help.js                 # Texte d'aide complet
│   │   ├── support.js              # Menu Soutien utilisateur (texte + liste des sites)
│   │   └── admin.js                # Panel admin complet : stats, clés API, ads, soutien
│   │
│   ├── services/
│   │   ├── agnes.js                # SEULE couche qui parle à l'API Agnes (création + polling)
│   │   ├── api-manager.js          # ApiKeyManager : CRUD clés, rotation, cooldown, stats
│   │   ├── video-manager.js        # CRUD video_jobs, orchestration agnes.js, stats admin
│   │   ├── membership.js           # Vérification réelle getChatMember
│   │   ├── cooldown.js             # Cooldown individuel 20s persisté en SQLite
│   │   ├── ads.js                  # CRUD publicités + sélection + fréquence
│   │   └── support.js              # CRUD sites de soutien + texte d'info
│   │
│   ├── keyboards/
│   │   ├── main.js                 # ReplyKeyboardMarkup principal + clavier abonnement requis
│   │   ├── video.js                # Claviers inline du workflow (format/style/durée/confirmation)
│   │   └── admin.js                # Tous les claviers inline du panel admin
│   │
│   └── utils/
│       ├── logger.js               # Logs INFO/WARN/ERROR (console + fichier logs/bot.log)
│       ├── helpers.js              # maskKey, encrypt/decrypt (AES-256-GCM), framesForSeconds,
│       │                             sleep, formatDate, safeUserLabel
│       └── session.js              # Sessions de workflow en mémoire, par telegram_user_id
│
├── data/
│   └── bot.sqlite                  # Créé automatiquement au premier lancement
│
├── temp/                           # Images téléchargées temporairement (nettoyées après usage)
│
├── logs/                           # Logs fichier (créé automatiquement)
│
├── .env.example                    # Modèle de configuration (aucun secret réel)
├── .gitignore
├── ecosystem.config.js             # Configuration PM2
├── package.json
├── README.md                       # Installation et configuration
├── RAPPORT.md                      # Mémoire du projet (objectif, état, prochaines étapes)
└── plan.md                         # Ce fichier
```

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

## Flux de callback_data (boutons inline)

| Préfixe               | Géré par             | Exemple                        |
|------------------------|-----------------------|---------------------------------|
| `check_membership`     | handlers/video.js     | vérification abonnement          |
| `format_*`             | handlers/video.js     | `format_9:16`, `format_auto`     |
| `style_*`              | handlers/video.js     | `style_cinematic`, `style_none`  |
| `duration_*`           | handlers/video.js     | `duration_5`, `duration_auto`    |
| `confirm_*`            | handlers/video.js     | `confirm_generate`, `confirm_edit`, `confirm_cancel` |
| `edit_*`               | handlers/video.js     | `edit_prompt`, `edit_back`       |
| `new_video`            | handlers/video.js     | relance le workflow              |
| `admin_*`              | handlers/admin.js     | navigation du panel admin        |
| `api_*`                | handlers/admin.js     | gestion des clés API             |
| `ads_*`, `ad_*`        | handlers/admin.js     | gestion des publicités           |
| `support_*`, `site_*`  | handlers/admin.js     | gestion du Soutien / sites        |

## Points d'extension prévus

- Changer de modèle Agnes : `AGNES_MODEL` en `.env` + éventuellement `buildCreatePayload()` /
  `fetchVideoResult()` dans `src/services/agnes.js`.
- Ajouter un système de crédits/paiement plus tard : brancher sur `handlers/video.js` juste avant
  `runGeneration()`, sans toucher au reste du workflow.
- Édition complète des ads/sites existants (actuellement suppression + recréation) : ajouter des
  états `ADMIN_AD_EDIT_*` / `ADMIN_SITE_EDIT_*` dans `handlers/admin.js`.

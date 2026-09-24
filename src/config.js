require('dotenv').config();
const path = require('path');

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    // On ne bloque pas le require() du module (utile pour les scripts utilitaires),
    // mais bot.js vérifie explicitement les champs critiques au démarrage.
    return '';
  }
  return value;
}

const config = {
  telegram: {
    token: required('TELEGRAM_BOT_TOKEN'),
    adminId: parseInt(required('ADMIN_ID', '1299831974'), 10),
    requiredChannelUsername: required('REQUIRED_CHANNEL_USERNAME', 'Deku225_Master'),
    requiredChannelLink: required('REQUIRED_CHANNEL_LINK', 'https://t.me/Deku225_Master')
  },
  agnes: {
    model: required('AGNES_MODEL', 'agnes-video-v2.0'),
    baseUrl: required('AGNES_BASE_URL', 'https://apihub.agnes-ai.com'),
    createPath: required('AGNES_CREATE_PATH', '/v1/videos'),
    resultPath: required('AGNES_RESULT_PATH', '/agnesapi'),
    pollIntervalMs: parseInt(required('AGNES_POLL_INTERVAL_MS', '4000'), 10),
    pollMaxAttempts: parseInt(required('AGNES_POLL_MAX_ATTEMPTS', '150'), 10)
  },
  security: {
    encryptionKey: required('ENCRYPTION_KEY')
  },
  bot: {
    cooldownSeconds: parseInt(required('GENERATION_COOLDOWN_SECONDS', '20'), 10)
  },
  db: {
    path: path.resolve(process.cwd(), required('DATABASE_PATH', './data/bot.sqlite'))
  },
  tempDir: path.resolve(process.cwd(), required('TEMP_DIR', './temp')),

  // Correspondances format -> résolution.
  // Agnes "normalise" toute taille vers le préset le plus proche : il faut donc envoyer de
  // vraies proportions 9:16 / 16:9 (multiples de 64, palier 720p). 768x1152 (2:3) était
  // ramené à 3:4 au lieu de 9:16. Pour des vidéos plus rapides : 448x832 / 832x448 (480p).
  formats: {
    '9:16': { width: 704, height: 1280, label: '📱 9:16 (vertical)' },
    '16:9': { width: 1280, height: 704, label: '🖥️ 16:9 (horizontal)' }
  },

  // Durée -> num_frames, en respectant num_frames = 8n + 1 et num_frames <= 441
  durations: {
    '3': { seconds: 3, num_frames: 81, label: '⚡ 3 secondes' },
    '5': { seconds: 5, num_frames: 121, label: '🎬 5 secondes' },
    '10': { seconds: 10, num_frames: 241, label: '🔥 10 secondes' },
    '18': { seconds: 18, num_frames: 441, label: '🚀 18 secondes' }
  },
  defaultDurationKey: '5',
  frameRate: 24,

  styles: {
    cinematic: {
      label: '🎬 Cinématique',
      suffix:
        'Cinematic visual style, smooth camera movement, cinematic lighting, subtle depth of field.'
    },
    realistic: {
      label: '📸 Réaliste',
      suffix:
        'Photorealistic visual style, natural lighting, realistic physics and motion.'
    },
    artistic: {
      label: '🎨 Artistique',
      suffix:
        'Artistic and stylized visual rendering, expressive color grading, creative motion.'
    },
    dynamic: {
      label: '⚡ Dynamique',
      suffix:
        'Dynamic and energetic motion, fast-paced camera movement, vivid action.'
    },
    anime: {
      label: '🌌 Anime',
      suffix:
        'Anime-inspired visual style, stylized motion, vibrant colors.'
    },
    none: { label: '✨ Aucun style', suffix: '' }
  }
};

module.exports = config;

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const logger = require('./utils/logger');
require('./database'); // initialise le schéma SQLite au démarrage

const { handleStart, upsertUser, touchLastSeen } = require('./handlers/start');
const { handleHelp } = require('./handlers/help');
const { handleSupport } = require('./handlers/support');
const {
  startVideoCreation,
  handlePhoto,
  handlePromptText,
  handleVideoCallback
} = require('./handlers/video');
const {
  openAdminPanel,
  handleAdminCallback,
  handleAdminTextInput,
  handleAdminPhotoInput
} = require('./handlers/admin');
const { getSession } = require('./utils/session');

if (!config.telegram.token) {
  logger.error('TELEGRAM_BOT_TOKEN manquant dans .env. Arrêt du bot.');
  process.exit(1);
}
if (!config.security.encryptionKey) {
  logger.error('ENCRYPTION_KEY manquante dans .env. Arrêt du bot.');
  process.exit(1);
}

const bot = new TelegramBot(config.telegram.token, { polling: true });

logger.info('Darkdeku225 AI Video démarré', { model: config.agnes.model });

// ------------------------------------------------------------------
// Commandes
// ------------------------------------------------------------------
bot.onText(/^\/start/, async (msg) => {
  try {
    await handleStart(bot, msg);
  } catch (err) {
    logger.error('Erreur /start', { message: err.message });
  }
});

// ------------------------------------------------------------------
// Messages texte (menu ReplyKeyboard + workflow + admin)
// ------------------------------------------------------------------
bot.on('message', async (msg) => {
  try {
    if (!msg.from || msg.from.is_bot) return;
    const telegramUserId = msg.from.id;
    const chatId = msg.chat.id;

    upsertUser(msg.from);
    touchLastSeen(telegramUserId);

    // Photos : d'abord pour l'admin (image de publicité), sinon pour le workflow vidéo
    if (msg.photo && msg.photo.length > 0) {
      const handledByAdminPhoto = await handleAdminPhotoInput(bot, msg);
      if (handledByAdminPhoto) return;
      await handlePhoto(bot, msg);
      return;
    }

    const text = (msg.text || '').trim();
    if (!text) return;

    switch (text) {
      case '🎬 Créer une vidéo':
        await startVideoCreation(bot, msg);
        return;
      case 'ℹ️ Aide':
        await handleHelp(bot, chatId);
        return;
      case '🤝 Soutien':
        await handleSupport(bot, chatId);
        return;
      case '👑 Admin':
        await openAdminPanel(bot, chatId, telegramUserId);
        return;
      default:
        break;
    }

    if (text.startsWith('/')) return; // autres commandes non gérées

    // Entrée texte admin (ajout de clé, ads, sites...) en priorité si en session admin
    const handledByAdmin = await handleAdminTextInput(bot, msg);
    if (handledByAdmin) return;

    // Sinon, entrée texte du workflow vidéo (le prompt)
    const session = getSession(telegramUserId);
    if (session.state === 'WAITING_PROMPT') {
      await handlePromptText(bot, msg);
      return;
    }
    if (session.state === 'WAITING_IMAGE') {
      await bot.sendMessage(chatId, `🖼️ Merci d'envoyer une image (photo), pas du texte.`);
      return;
    }
  } catch (err) {
    logger.error('Erreur traitement message', { message: err.message });
  }
});

// ------------------------------------------------------------------
// Callback queries (boutons inline)
// ------------------------------------------------------------------
bot.on('callback_query', async (query) => {
  try {
    if (!query.from || !query.message) return;

    const handledByAdmin = await handleAdminCallback(bot, query);
    if (handledByAdmin) return;

    const handledByVideo = await handleVideoCallback(bot, query);
    if (handledByVideo) return;

    await bot.answerCallbackQuery(query.id).catch(() => {});
  } catch (err) {
    logger.error('Erreur callback_query', { message: err.message, data: query.data });
    await bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

// ------------------------------------------------------------------
// Gestion des erreurs de polling / webhook
// ------------------------------------------------------------------
bot.on('polling_error', (err) => {
  logger.error('Erreur de polling Telegram', { message: err.message });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetée non gérée', { message: reason?.message || String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée', { message: err.message });
});

module.exports = bot;

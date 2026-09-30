const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const logger = require('./utils/logger');

if (!config.telegram.token) {
  logger.error('TELEGRAM_BOT_TOKEN manquant dans .env. Arrêt du bot.');
  process.exit(1);
}
if (!config.security.encryptionKey) {
  logger.error('ENCRYPTION_KEY manquante dans .env. Arrêt du bot.');
  process.exit(1);
}
if (!config.webapp.url) {
  logger.error('WEBAPP_URL manquante dans .env. Arrêt du bot.');
  process.exit(1);
}

const bot = new TelegramBot(config.telegram.token, { polling: true });

logger.info('Darkdeku225 AI Video démarré (mode Mini App)', {
  model: config.agnes.model,
  webappUrl: config.webapp.url
});

// Bouton persistant dans la barre Telegram (à côté du champ de saisie) qui ouvre la Mini App.
bot
  .setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Ouvrir', web_app: { url: config.webapp.url } }
  })
  .catch((err) => logger.warn('Impossible de configurer le menu button', { message: err.message }));

bot.onText(/^\/start/, async (msg) => {
  try {
    await bot.sendMessage(
      msg.chat.id,
      `🎬 *Bienvenue sur Darkdeku225 AI Video*\n\n` +
        `Transformez une image en vidéo animée grâce à l'intelligence artificielle.\n\n` +
        `Appuyez sur le bouton ci-dessous pour ouvrir l'application.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Ouvrir Darkdeku225 AI Video', web_app: { url: config.webapp.url } }]
          ]
        }
      }
    );
  } catch (err) {
    logger.error('Erreur /start', { message: err.message });
  }
});

bot.on('polling_error', (err) => {
  logger.error('Erreur de polling Telegram', { message: err.message });
});

module.exports = bot;

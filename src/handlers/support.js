const SupportService = require('../services/support');

async function handleSupport(bot, chatId) {
  const infoText = SupportService.getInfoText();
  const sites = SupportService.listSites({ onlyActive: true });

  await bot.sendMessage(chatId, `🤝 *Soutien*\n\n${infoText}`, { parse_mode: 'Markdown' });

  if (sites.length > 0) {
    const keyboard = {
      reply_markup: {
        inline_keyboard: sites.map((s) => [{ text: s.button_text || s.name, url: s.url }])
      }
    };
    await bot.sendMessage(chatId, '🌐 *Mes plateformes*', {
      parse_mode: 'Markdown',
      ...keyboard
    });
  }
}

module.exports = { handleSupport };

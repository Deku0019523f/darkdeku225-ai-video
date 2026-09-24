const config = require('../config');

function mainMenuKeyboard(telegramUserId) {
  const rows = [['🎬 Créer une vidéo'], ['ℹ️ Aide', '🤝 Soutien']];
  if (telegramUserId === config.telegram.adminId) {
    rows.push(['👑 Admin']);
  }
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      is_persistent: true
    }
  };
}

function channelRequiredKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Rejoindre le canal', url: config.telegram.requiredChannelLink }],
        [{ text: '✅ Vérifier mon abonnement', callback_data: 'check_membership' }]
      ]
    }
  };
}

module.exports = { mainMenuKeyboard, channelRequiredKeyboard };

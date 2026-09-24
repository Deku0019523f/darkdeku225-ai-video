const config = require('../config');

function formatKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📱 9:16', callback_data: 'format_9:16' },
          { text: '🖥️ 16:9', callback_data: 'format_16:9' }
        ],
        [{ text: '🤖 Auto', callback_data: 'format_auto' }]
      ]
    }
  };
}

function styleKeyboard() {
  const entries = Object.entries(config.styles).filter(([key]) => key !== 'none');
  const rows = entries.map(([key, style]) => [{ text: style.label, callback_data: `style_${key}` }]);
  rows.push([{ text: '✨ Aucun style', callback_data: 'style_none' }]);
  rows.push([{ text: '⬅️ Passer', callback_data: 'style_none' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function durationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚡ 3 secondes', callback_data: 'duration_3' },
          { text: '🎬 5 secondes', callback_data: 'duration_5' }
        ],
        [
          { text: '🔥 10 secondes', callback_data: 'duration_10' },
          { text: '🚀 18 secondes', callback_data: 'duration_18' }
        ],
        [{ text: '🤖 Auto', callback_data: 'duration_auto' }]
      ]
    }
  };
}

function confirmationKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Générer la vidéo', callback_data: 'confirm_generate' }],
        [
          { text: '✏️ Modifier', callback_data: 'confirm_edit' },
          { text: '❌ Annuler', callback_data: 'confirm_cancel' }
        ]
      ]
    }
  };
}

function editChoiceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🖼️ Changer l\'image', callback_data: 'edit_image' }],
        [{ text: '✍️ Changer le prompt', callback_data: 'edit_prompt' }],
        [{ text: '📐 Changer le format', callback_data: 'edit_format' }],
        [{ text: '✨ Changer le style', callback_data: 'edit_style' }],
        [{ text: '⏱️ Changer la durée', callback_data: 'edit_duration' }],
        [{ text: '⬅️ Retour au récapitulatif', callback_data: 'edit_back' }]
      ]
    }
  };
}

function afterVideoKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🎬 Créer une autre vidéo', callback_data: 'new_video' }]]
    }
  };
}

module.exports = {
  formatKeyboard,
  styleKeyboard,
  durationKeyboard,
  confirmationKeyboard,
  editChoiceKeyboard,
  afterVideoKeyboard
};

function adminPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Statistiques', callback_data: 'admin_stats' }],
        [{ text: '🔑 API', callback_data: 'admin_api' }],
        [{ text: '📢 Ads', callback_data: 'admin_ads' }],
        [{ text: '🤝 Soutien', callback_data: 'admin_support' }]
      ]
    }
  };
}

function apiPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Statistiques', callback_data: 'api_stats' }],
        [{ text: '➕ Ajouter une clé', callback_data: 'api_add' }],
        [{ text: '🗑 Supprimer une clé', callback_data: 'api_remove' }],
        [{ text: '🔄 Actualiser', callback_data: 'admin_api' }],
        [{ text: '⬅️ Retour', callback_data: 'admin_back' }]
      ]
    }
  };
}

function apiKeyListKeyboard(keys, actionPrefix) {
  const rows = keys.map((k) => [
    { text: `🔑 API #${k.id} ${k.masked_key}`, callback_data: `${actionPrefix}_${k.id}` }
  ]);
  rows.push([{ text: '⬅️ Retour', callback_data: 'admin_api' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function confirmDeleteKeyboard(actionPrefix, id) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Oui', callback_data: `${actionPrefix}_confirm_${id}` },
          { text: '❌ Annuler', callback_data: 'admin_api' }
        ]
      ]
    }
  };
}

function adsPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Ajouter une publicité', callback_data: 'ads_add' }],
        [{ text: '📋 Liste des publicités', callback_data: 'ads_list' }],
        [{ text: '⬅️ Retour', callback_data: 'admin_back' }]
      ]
    }
  };
}

function adItemKeyboard(ad) {
  const toggleLabel = ad.active ? '🔴 Désactiver' : '🟢 Activer';
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ Modifier', callback_data: `ad_edit_${ad.id}` }],
        [{ text: toggleLabel, callback_data: `ad_toggle_${ad.id}` }],
        [{ text: '🗑 Supprimer', callback_data: `ad_delete_${ad.id}` }],
        [{ text: '⬅️ Retour', callback_data: 'ads_list' }]
      ]
    }
  };
}

function supportPanelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👤 Informations', callback_data: 'support_info' }],
        [{ text: '🌐 Sites', callback_data: 'support_sites' }],
        [{ text: '⬅️ Retour', callback_data: 'admin_back' }]
      ]
    }
  };
}

function supportSitesKeyboard(sites) {
  const rows = sites.map((s) => [
    { text: `${s.active ? '🟢' : '🔴'} ${s.name}`, callback_data: `site_view_${s.id}` }
  ]);
  rows.push([{ text: '➕ Ajouter un site', callback_data: 'site_add' }]);
  rows.push([{ text: '⬅️ Retour', callback_data: 'admin_support' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function siteItemKeyboard(site) {
  const toggleLabel = site.active ? '🔴 Désactiver' : '🟢 Activer';
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ Modifier', callback_data: `site_edit_${site.id}` }],
        [{ text: toggleLabel, callback_data: `site_toggle_${site.id}` }],
        [{ text: '🗑 Supprimer', callback_data: `site_delete_${site.id}` }],
        [{ text: '⬅️ Retour', callback_data: 'support_sites' }]
      ]
    }
  };
}

module.exports = {
  adminPanelKeyboard,
  apiPanelKeyboard,
  apiKeyListKeyboard,
  confirmDeleteKeyboard,
  adsPanelKeyboard,
  adItemKeyboard,
  supportPanelKeyboard,
  supportSitesKeyboard,
  siteItemKeyboard
};

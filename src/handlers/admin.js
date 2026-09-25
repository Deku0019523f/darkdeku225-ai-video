const config = require('../config');
const { getSession, setState, resetSession } = require('../utils/session');
const ApiKeyManager = require('../services/api-manager');
const VideoManager = require('../services/video-manager');
const AdsService = require('../services/ads');
const SupportService = require('../services/support');
const { formatDate, escapeMarkdown, sendMarkdownSafe } = require('../utils/helpers');
const {
  adminPanelKeyboard,
  apiPanelKeyboard,
  apiKeyListKeyboard,
  confirmDeleteKeyboard,
  adsPanelKeyboard,
  adItemKeyboard,
  supportPanelKeyboard,
  supportSitesKeyboard,
  siteItemKeyboard
} = require('../keyboards/admin');

function isAdmin(telegramUserId) {
  return telegramUserId === config.telegram.adminId;
}

async function openAdminPanel(bot, chatId, telegramUserId) {
  if (!isAdmin(telegramUserId)) return;
  await bot.sendMessage(chatId, `👑 *Panel administrateur*`, {
    parse_mode: 'Markdown',
    ...adminPanelKeyboard()
  });
}

// ------------------------------------------------------------------
// Statistiques
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// Mise en forme des statistiques (HTML : plus fiable que Markdown, pas
// d'échappement à gérer pour des chiffres et libellés internes)
// ------------------------------------------------------------------

/** Barre de progression textuelle façon "██████░░░░ 62%". */
function progressBar(percent, length = 10) {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled) + ` ${Math.round(p)}%`;
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return 'n/a';
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min} min ${sec.toString().padStart(2, '0')} s`;
}

const STYLE_LABELS = {
  cinematic: '🎬 Cinématique',
  realistic: '📸 Réaliste',
  artistic: '🎨 Artistique',
  dynamic: '⚡ Dynamique',
  anime: '🌌 Anime',
  none: '✨ Aucun style'
};
const FORMAT_LABELS = { '9:16': '📱 9:16', '16:9': '🖥️ 16:9' };

function formatTopList(rows, labels, key) {
  if (!rows || rows.length === 0) return '  —';
  return rows.map((r) => `  • ${labels[r[key]] || r[key]} — ${r.c}`).join('\n');
}

async function showStats(bot, chatId) {
  const stats = VideoManager.getStats();
  const apiStats = ApiKeyManager.getStats();
  const u = stats.users;
  const v = stats.videos;

  const activeTodayPct = u.total > 0 ? (u.activeToday / u.total) * 100 : 0;
  const successRateText =
    v.successRate === null ? 'n/a (aucune génération terminée)' : `${v.successRate.toFixed(1)}%`;

  const text =
    `📊 <b>Tableau de bord</b>\n` +
    `<i>Généré le ${formatDate(new Date().toISOString())}</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 <b>Utilisateurs</b>  (${u.total} au total)\n` +
    `${progressBar(activeTodayPct)}  actifs aujourd'hui\n` +
    `┌ Nouveaux aujourd'hui : <b>${u.newToday}</b>\n` +
    `├ Actifs aujourd'hui   : <b>${u.activeToday}</b>\n` +
    `├ Actifs 7 derniers j. : <b>${u.activeWeek}</b>\n` +
    `└ Actifs 30 derniers j.: <b>${u.activeMonth}</b>\n\n` +
    `🎬 <b>Vidéos</b>  (${v.total} générations)\n` +
    `┌ Aujourd'hui : <b>${v.today}</b>   Semaine : <b>${v.week}</b>   Mois : <b>${v.month}</b>\n` +
    `├ ✅ Réussies : <b>${v.success}</b>    ❌ Échouées : <b>${v.failed}</b>    ⏳ En cours : <b>${v.pending}</b>\n` +
    `├ Taux de réussite : <b>${successRateText}</b>\n` +
    `├ Moyenne / utilisateur : <b>${v.avgPerUser.toFixed(1)}</b> vidéo(s)\n` +
    `└ Durée moyenne de génération : <b>${formatDuration(v.avgGenerationSeconds)}</b>\n\n` +
    `🏆 <b>Styles les plus utilisés</b>\n${formatTopList(v.topStyles, STYLE_LABELS, 'style')}\n\n` +
    `📐 <b>Formats les plus utilisés</b>\n${formatTopList(v.topFormats, FORMAT_LABELS, 'format')}\n\n` +
    `🔑 <b>Clés API</b>  (${apiStats.total} au total)\n` +
    `┌ 🟢 Disponibles : <b>${apiStats.available}</b>\n` +
    `├ 🟠 Limitées    : <b>${apiStats.limited}</b>\n` +
    `├ 🔴 Désactivées : <b>${apiStats.disabled}</b>\n` +
    `└ Requêtes envoyées : <b>${apiStats.usage}</b> (dont ${apiStats.rateLimits} limitées)`;

  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...adminPanelKeyboard() });
}

async function showApiKeyStats(bot, chatId) {
  const keys = ApiKeyManager.listAll();
  if (keys.length === 0) {
    await bot.sendMessage(chatId, `Aucune clé API enregistrée pour le moment.`, apiPanelKeyboard());
    return;
  }

  const stateIcons = { active: '🟢', limited: '🟠', disabled: '🔴' };
  let text = `🔑 <b>Détail par clé API</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const k of keys) {
    const icon = stateIcons[k.status] || '⚪️';
    const errorRate = k.usage_count > 0 ? (k.error_count / k.usage_count) * 100 : 0;
    text +=
      `${icon} <b>API #${k.id}</b>  <code>${k.masked_key}</code>\n` +
      `┌ Statut : <b>${k.status}</b>\n` +
      `├ Utilisations : <b>${k.usage_count}</b>  (✅ ${k.success_count} · ❌ ${k.error_count} · 🚫 ${k.rate_limit_count})\n` +
      `├ Taux d'erreur : <b>${errorRate.toFixed(1)}%</b>\n` +
      `└ Dernière utilisation : ${formatDate(k.last_used_at)}\n\n`;
  }
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...apiPanelKeyboard() });
}

// ------------------------------------------------------------------
// Gestion des clés API
// ------------------------------------------------------------------
async function startAddKey(bot, chatId, telegramUserId) {
  setState(telegramUserId, 'ADMIN_WAITING_NEW_KEY', {});
  await bot.sendMessage(chatId, `Envoyez la clé API Agnes.`);
}

async function startRemoveKey(bot, chatId) {
  const keys = ApiKeyManager.listAll();
  if (keys.length === 0) {
    await bot.sendMessage(chatId, `Aucune clé à supprimer.`, apiPanelKeyboard());
    return;
  }
  await bot.sendMessage(
    chatId,
    `Sélectionnez la clé à supprimer :`,
    apiKeyListKeyboard(keys, 'api_delete')
  );
}

async function confirmRemoveKeyPrompt(bot, chatId, id) {
  const key = ApiKeyManager.getById(id);
  if (!key) {
    await bot.sendMessage(chatId, `Clé introuvable.`, apiPanelKeyboard());
    return;
  }
  await bot.sendMessage(
    chatId,
    `⚠️ Voulez-vous réellement supprimer cette clé ?\n\n🔑 API #${key.id} ${key.masked_key}`,
    confirmDeleteKeyboard('api_delete', id)
  );
}

async function handleAdminTextInput(bot, msg) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  if (!isAdmin(telegramUserId)) return false;
  const session = getSession(telegramUserId);
  const text = (msg.text || '').trim();

  switch (session.state) {
    case 'ADMIN_WAITING_NEW_KEY': {
      try {
        const key = ApiKeyManager.addKey(text);
        resetSession(telegramUserId);
        await bot.sendMessage(chatId, `✅ Clé ajoutée avec succès.\n🔑 API #${key.id} ${key.masked_key}`, apiPanelKeyboard());
      } catch (err) {
        await bot.sendMessage(chatId, `❌ ${err.message}`);
      }
      return true;
    }
    case 'ADMIN_AD_WAITING_IMAGE': {
      // Cette étape attend normalement une photo (voir handleAdminPhotoInput) ; si
      // l'admin envoie du texte ici, seul "-" (passer) est accepté.
      if (text === '-') {
        setState(telegramUserId, 'ADMIN_AD_WAITING_MESSAGE', { adImage: null });
        await bot.sendMessage(chatId, `Message de la publicité :`);
      } else {
        await bot.sendMessage(chatId, `Envoyez une photo, ou "-" pour ne pas mettre d'image.`);
      }
      return true;
    }
    case 'ADMIN_AD_WAITING_MESSAGE': {
      setState(telegramUserId, 'ADMIN_AD_WAITING_BUTTON', { adMessage: text });
      await bot.sendMessage(chatId, `Texte du bouton (ou "-" pour aucun) :`);
      return true;
    }
    case 'ADMIN_AD_WAITING_BUTTON': {
      const buttonText = text === '-' ? null : text;
      setState(telegramUserId, 'ADMIN_AD_WAITING_URL', { adButtonText: buttonText });
      await bot.sendMessage(chatId, `Lien de la publicité (ou "-" pour aucun) :`);
      return true;
    }
    case 'ADMIN_AD_WAITING_URL': {
      const url = text === '-' ? null : text;
      const d = session.data;
      const ad = AdsService.add({
        image: d.adImage || null,
        message: d.adMessage,
        buttonText: d.adButtonText,
        url
      });
      resetSession(telegramUserId);
      await bot.sendMessage(chatId, `✅ Publicité #${ad.id} créée.`, adsPanelKeyboard());
      return true;
    }
    case 'ADMIN_SITE_WAITING_NAME': {
      setState(telegramUserId, 'ADMIN_SITE_WAITING_DESCRIPTION', { siteName: text });
      await bot.sendMessage(chatId, `Description du site (ou "-" pour aucune) :`);
      return true;
    }
    case 'ADMIN_SITE_WAITING_DESCRIPTION': {
      const description = text === '-' ? null : text;
      setState(telegramUserId, 'ADMIN_SITE_WAITING_URL', { siteDescription: description });
      await bot.sendMessage(chatId, `URL du site :`);
      return true;
    }
    case 'ADMIN_SITE_WAITING_URL': {
      setState(telegramUserId, 'ADMIN_SITE_WAITING_BUTTON', { siteUrl: text });
      await bot.sendMessage(chatId, `Texte du bouton (ou "-" pour utiliser le nom du site) :`);
      return true;
    }
    case 'ADMIN_SITE_WAITING_BUTTON': {
      const d = session.data;
      const buttonText = text === '-' ? d.siteName : text;
      const site = SupportService.addSite({
        name: d.siteName,
        description: d.siteDescription,
        url: d.siteUrl,
        buttonText,
        position: 0
      });
      resetSession(telegramUserId);
      await bot.sendMessage(chatId, `✅ Site "${site.name}" ajouté.`, supportPanelKeyboard());
      return true;
    }
    case 'ADMIN_SUPPORT_WAITING_INFO': {
      SupportService.setInfoText(text);
      resetSession(telegramUserId);
      await bot.sendMessage(chatId, `✅ Informations mises à jour.`, supportPanelKeyboard());
      return true;
    }
    default:
      return false;
  }
}

// ------------------------------------------------------------------
// Ads
// ------------------------------------------------------------------
async function listAds(bot, chatId) {
  const ads = AdsService.listAll();
  if (ads.length === 0) {
    await bot.sendMessage(chatId, `Aucune publicité créée.`, adsPanelKeyboard());
    return;
  }
  for (const ad of ads) {
    const stateLabel = ad.active ? '🟢 Active' : '🔴 Inactive';
    const text = `📢 Publicité #${ad.id} — ${stateLabel}\n\n${ad.message}${ad.url ? `\n🔗 ${ad.url}` : ''}`;
    if (ad.image) {
      await bot.sendPhoto(chatId, ad.image, { caption: text, ...adItemKeyboard(ad) }).catch(
        () => bot.sendMessage(chatId, text, adItemKeyboard(ad))
      );
    } else {
      await bot.sendMessage(chatId, text, adItemKeyboard(ad));
    }
  }
}

async function toggleAd(bot, chatId, id) {
  const ad = AdsService.getById(id);
  if (!ad) return;
  AdsService.setActive(id, ad.active ? 0 : 1);
  await bot.sendMessage(chatId, `Statut de la publicité #${id} mis à jour.`, adsPanelKeyboard());
}

async function deleteAd(bot, chatId, id) {
  AdsService.remove(id);
  await bot.sendMessage(chatId, `🗑 Publicité #${id} supprimée.`, adsPanelKeyboard());
}

// ------------------------------------------------------------------
// Sites de soutien
// ------------------------------------------------------------------
async function listSites(bot, chatId) {
  const sites = SupportService.listSites();
  await bot.sendMessage(chatId, `🌐 *Sites configurés*`, {
    parse_mode: 'Markdown',
    ...supportSitesKeyboard(sites)
  });
}

async function viewSite(bot, chatId, id) {
  const site = SupportService.getSite(id);
  if (!site) return;
  const text =
    `🌐 *${escapeMarkdown(site.name)}*\n\n` +
    `${escapeMarkdown(site.description || '')}\n` +
    `🔗 ${escapeMarkdown(site.url)}\n` +
    `Bouton : ${escapeMarkdown(site.button_text)}\n` +
    `Position : ${site.position}\n` +
    `Statut : ${site.active ? '🟢 Actif' : '🔴 Inactif'}`;
  await sendMarkdownSafe(bot, chatId, text, siteItemKeyboard(site));
}

async function toggleSite(bot, chatId, id) {
  const site = SupportService.getSite(id);
  if (!site) return;
  SupportService.updateSite(id, { active: site.active ? 0 : 1 });
  await listSites(bot, chatId);
}

async function deleteSite(bot, chatId, id) {
  SupportService.removeSite(id);
  await bot.sendMessage(chatId, `🗑 Site supprimé.`, supportPanelKeyboard());
}

// ------------------------------------------------------------------
// Réception d'une photo (utilisée pour l'image d'une publicité)
// ------------------------------------------------------------------
async function handleAdminPhotoInput(bot, msg) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  if (!isAdmin(telegramUserId)) return false;
  const session = getSession(telegramUserId);
  if (session.state !== 'ADMIN_AD_WAITING_IMAGE') return false;

  const photos = msg.photo;
  const best = photos[photos.length - 1];
  setState(telegramUserId, 'ADMIN_AD_WAITING_MESSAGE', { adImage: best.file_id });
  await bot.sendMessage(chatId, `Message de la publicité :`);
  return true;
}

// ------------------------------------------------------------------
// Dispatch des callback_query du panel admin
// ------------------------------------------------------------------
async function handleAdminCallback(bot, query) {
  const telegramUserId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!isAdmin(telegramUserId)) return false;
  if (!data.startsWith('admin_') && !data.startsWith('api_') && !data.startsWith('ads_') &&
      !data.startsWith('ad_') && !data.startsWith('support_') && !data.startsWith('site_')) {
    return false;
  }

  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'admin_back') {
    resetSession(telegramUserId);
    await openAdminPanel(bot, chatId, telegramUserId);
    return true;
  }
  if (data === 'admin_stats') {
    await showStats(bot, chatId);
    return true;
  }
  if (data === 'admin_api') {
    resetSession(telegramUserId);
    await bot.sendMessage(chatId, `🔑 *Gestion des API*`, { parse_mode: 'Markdown', ...apiPanelKeyboard() });
    return true;
  }
  if (data === 'api_stats') {
    await showApiKeyStats(bot, chatId);
    return true;
  }
  if (data === 'api_add') {
    await startAddKey(bot, chatId, telegramUserId);
    return true;
  }
  if (data === 'api_remove') {
    await startRemoveKey(bot, chatId);
    return true;
  }
  if (data.startsWith('api_delete_confirm_')) {
    const id = parseInt(data.replace('api_delete_confirm_', ''), 10);
    ApiKeyManager.removeKey(id);
    await bot.sendMessage(chatId, `✅ Clé #${id} supprimée.`, apiPanelKeyboard());
    return true;
  }
  if (data.startsWith('api_delete_')) {
    const id = parseInt(data.replace('api_delete_', ''), 10);
    await confirmRemoveKeyPrompt(bot, chatId, id);
    return true;
  }

  if (data === 'admin_ads') {
    await bot.sendMessage(chatId, `📢 *Gestion des publicités*`, { parse_mode: 'Markdown', ...adsPanelKeyboard() });
    return true;
  }
  if (data === 'ads_add') {
    setState(telegramUserId, 'ADMIN_AD_WAITING_IMAGE', {});
    await bot.sendMessage(chatId, `Envoyez l'image de la publicité, ou "-" pour ne pas en mettre :`);
    return true;
  }
  if (data === 'ads_list') {
    await listAds(bot, chatId);
    return true;
  }
  if (data.startsWith('ad_toggle_')) {
    await toggleAd(bot, chatId, parseInt(data.replace('ad_toggle_', ''), 10));
    return true;
  }
  if (data.startsWith('ad_delete_')) {
    await deleteAd(bot, chatId, parseInt(data.replace('ad_delete_', ''), 10));
    return true;
  }
  if (data.startsWith('ad_edit_')) {
    await bot.sendMessage(chatId, `Pour modifier une publicité, supprimez-la puis recréez-la avec ➕ Ajouter une publicité.`, adsPanelKeyboard());
    return true;
  }

  if (data === 'admin_support') {
    resetSession(telegramUserId);
    await bot.sendMessage(chatId, `🤝 *Gestion du Soutien*`, { parse_mode: 'Markdown', ...supportPanelKeyboard() });
    return true;
  }
  if (data === 'support_info') {
    setState(telegramUserId, 'ADMIN_SUPPORT_WAITING_INFO', {});
    await bot.sendMessage(chatId, `Envoyez le nouveau texte d'information (affiché dans le menu Soutien) :`);
    return true;
  }
  if (data === 'support_sites') {
    await listSites(bot, chatId);
    return true;
  }
  if (data === 'site_add') {
    setState(telegramUserId, 'ADMIN_SITE_WAITING_NAME', {});
    await bot.sendMessage(chatId, `Nom du site :`);
    return true;
  }
  if (data.startsWith('site_view_')) {
    await viewSite(bot, chatId, parseInt(data.replace('site_view_', ''), 10));
    return true;
  }
  if (data.startsWith('site_toggle_')) {
    await toggleSite(bot, chatId, parseInt(data.replace('site_toggle_', ''), 10));
    return true;
  }
  if (data.startsWith('site_delete_')) {
    await deleteSite(bot, chatId, parseInt(data.replace('site_delete_', ''), 10));
    return true;
  }
  if (data.startsWith('site_edit_')) {
    await bot.sendMessage(chatId, `Pour modifier un site, supprimez-le puis recréez-le via ➕ Ajouter un site.`, supportPanelKeyboard());
    return true;
  }

  return false;
}

module.exports = {
  isAdmin,
  openAdminPanel,
  handleAdminCallback,
  handleAdminTextInput,
  handleAdminPhotoInput
};

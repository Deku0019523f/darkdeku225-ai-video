const db = require('../database');
const config = require('../config');
const { getSession, setState, resetSession } = require('../utils/session');
const ApiKeyManager = require('../services/api-manager');
const VideoManager = require('../services/video-manager');
const AdsService = require('../services/ads');
const SupportService = require('../services/support');
const { formatDate, escapeHtml, sleep } = require('../utils/helpers');
const { mainMenuKeyboard } = require('../keyboards/main');
const {
  SKIP_LABEL,
  CANCEL_LABEL,
  CONFIRM_LABEL,
  BACK_LABEL,
  BACK_TO_LIST_LABEL,
  QUIT_LABEL,
  extractId,
  adminMainKeyboard,
  apiMenuKeyboard,
  adsMenuKeyboard,
  supportMenuKeyboard,
  cancelKeyboard,
  skipCancelKeyboard,
  confirmCancelKeyboard,
  keyDeleteSelectKeyboard,
  adsListManageKeyboard,
  adItemKeyboard,
  sitesListManageKeyboard,
  siteItemKeyboard
} = require('../keyboards/admin');

function isAdmin(telegramUserId) {
  return telegramUserId === config.telegram.adminId;
}

async function openAdminPanel(bot, chatId, telegramUserId) {
  if (!isAdmin(telegramUserId)) return;
  setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'main' });
  await bot.sendMessage(chatId, `👑 <b>Panel administrateur</b>`, {
    parse_mode: 'HTML',
    ...adminMainKeyboard()
  });
}

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

  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...adminMainKeyboard() });
}

async function showApiKeyStats(bot, chatId) {
  const keys = ApiKeyManager.listAll();
  if (keys.length === 0) {
    await bot.sendMessage(chatId, `Aucune clé API enregistrée pour le moment.`, apiMenuKeyboard());
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
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...apiMenuKeyboard() });
}

// ------------------------------------------------------------------
// Diffusion d'une publicité à tous les utilisateurs (message privé),
// avec tentative d'épinglage chez chacun. C'est la seule façon pour une
// publicité d'atteindre tout le monde immédiatement : par défaut, les
// publicités actives ne sont montrées qu'aux utilisateurs qui terminent
// une génération, une fois toutes les N vidéos (voir ads_frequency).
// ------------------------------------------------------------------
async function broadcastAdToAllUsers(bot, ad) {
  const users = db.prepare('SELECT telegram_id FROM users').all();
  const keyboard = ad.url
    ? { reply_markup: { inline_keyboard: [[{ text: ad.button_text || 'En savoir plus', url: ad.url }]] } }
    : {};

  let sent = 0;
  let pinned = 0;
  let failed = 0;

  for (const { telegram_id } of users) {
    try {
      let message;
      if (ad.image) {
        message = await bot.sendPhoto(telegram_id, ad.image, { caption: ad.message, ...keyboard });
      } else {
        message = await bot.sendMessage(telegram_id, ad.message, keyboard);
      }
      sent += 1;
      try {
        await bot.pinChatMessage(telegram_id, message.message_id, { disable_notification: true });
        pinned += 1;
      } catch (_) {
        // Épinglage refusé côté client Telegram de cet utilisateur : pas bloquant.
      }
    } catch (err) {
      failed += 1;
      const retryAfter = err?.response?.body?.parameters?.retry_after;
      if (retryAfter) {
        await sleep((retryAfter + 1) * 1000);
      }
    }
    await sleep(40); // ~25 messages/seconde, sous la limite globale de Telegram
  }

  return { total: users.length, sent, pinned, failed };
}

// ------------------------------------------------------------------
// Rendu des écrans "liste" et "détail" (publicités, sites)
// ------------------------------------------------------------------
async function renderAdsList(bot, chatId, telegramUserId) {
  const ads = AdsService.listAll();
  setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'ads', adsView: 'list' });
  const header =
    ads.length === 0
      ? `Aucune publicité créée pour le moment.`
      : `📢 <b>Publicités</b> (${ads.length}) — choisissez-en une à gérer :`;
  await bot.sendMessage(chatId, header, { parse_mode: 'HTML', ...adsListManageKeyboard(ads) });
}

async function renderAdItem(bot, chatId, telegramUserId, adId) {
  const ad = AdsService.getById(adId);
  if (!ad) {
    await renderAdsList(bot, chatId, telegramUserId);
    return;
  }
  setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'ads', adsView: 'item', selectedAdId: ad.id });
  const stateLabel = ad.active ? '🟢 Active' : '🔴 Inactive';
  const text =
    `📢 <b>Publicité #${ad.id}</b> — ${stateLabel}\n\n` +
    `${escapeHtml(ad.message)}` +
    `${ad.url ? `\n🔗 ${escapeHtml(ad.url)}` : ''}` +
    `${ad.button_text ? `\n🔘 Bouton : ${escapeHtml(ad.button_text)}` : ''}\n\n` +
    `👁 Affichée automatiquement ${ad.display_count} fois jusqu'ici`;

  if (ad.image) {
    await bot
      .sendPhoto(chatId, ad.image, { caption: text, parse_mode: 'HTML', ...adItemKeyboard(ad) })
      .catch(() => bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...adItemKeyboard(ad) }));
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...adItemKeyboard(ad) });
  }
}

async function renderSitesList(bot, chatId, telegramUserId) {
  const sites = SupportService.listSites();
  setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'support', supportView: 'sites-list' });
  const header =
    sites.length === 0
      ? `Aucun site configuré pour le moment.`
      : `🌐 <b>Sites configurés</b> (${sites.length}) — choisissez-en un à gérer :`;
  await bot.sendMessage(chatId, header, { parse_mode: 'HTML', ...sitesListManageKeyboard(sites) });
}

async function renderSiteItem(bot, chatId, telegramUserId, siteId) {
  const site = SupportService.getSite(siteId);
  if (!site) {
    await renderSitesList(bot, chatId, telegramUserId);
    return;
  }
  setState(telegramUserId, 'ADMIN_IDLE', {
    adminScreen: 'support',
    supportView: 'site-item',
    selectedSiteId: site.id
  });
  const text =
    `🌐 <b>${escapeHtml(site.name)}</b>\n\n` +
    `${escapeHtml(site.description || '')}\n` +
    `🔗 ${escapeHtml(site.url)}\n` +
    `🔘 Bouton : ${escapeHtml(site.button_text)}\n` +
    `Statut : ${site.active ? '🟢 Actif' : '🔴 Inactif'}`;
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...siteItemKeyboard(site) });
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
  await bot.sendMessage(chatId, `Message de la publicité :`, cancelKeyboard());
  return true;
}

// ------------------------------------------------------------------
// Entrée principale : saisies de texte pendant une création/suppression
// (tier 1), puis appui sur un bouton de clavier de menu (tier 2).
// ------------------------------------------------------------------
async function handleAdminTextInput(bot, msg) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  if (!isAdmin(telegramUserId)) return false;
  const session = getSession(telegramUserId);
  const text = (msg.text || '').trim();

  switch (session.state) {
    case 'ADMIN_WAITING_NEW_KEY': {
      if (text === CANCEL_LABEL) {
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
        await bot.sendMessage(chatId, `❌ Annulé.`, apiMenuKeyboard());
        return true;
      }
      try {
        const key = ApiKeyManager.addKey(text);
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
        await bot.sendMessage(
          chatId,
          `✅ Clé ajoutée avec succès.\n🔑 API #${key.id} ${key.masked_key}`,
          apiMenuKeyboard()
        );
      } catch (err) {
        await bot.sendMessage(chatId, `❌ ${err.message}`, cancelKeyboard());
      }
      return true;
    }

    case 'ADMIN_WAITING_KEY_DELETE_SELECT': {
      if (text === CANCEL_LABEL) {
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
        await bot.sendMessage(chatId, `❌ Annulé.`, apiMenuKeyboard());
        return true;
      }
      const keyId = extractId(text);
      const key = keyId ? ApiKeyManager.getById(keyId) : null;
      if (!key) {
        await bot.sendMessage(chatId, `Sélection invalide, utilisez les boutons ci-dessous.`);
        return true;
      }
      setState(telegramUserId, 'ADMIN_WAITING_KEY_DELETE_CONFIRM', { selectedKeyId: keyId });
      await bot.sendMessage(
        chatId,
        `⚠️ Voulez-vous réellement supprimer cette clé ?\n\n🔑 API #${key.id} ${key.masked_key}`,
        confirmCancelKeyboard()
      );
      return true;
    }

    case 'ADMIN_WAITING_KEY_DELETE_CONFIRM': {
      if (text === CONFIRM_LABEL) {
        ApiKeyManager.removeKey(session.data.selectedKeyId);
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
        await bot.sendMessage(chatId, `✅ Clé supprimée.`, apiMenuKeyboard());
      } else {
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
        await bot.sendMessage(chatId, `❌ Annulé.`, apiMenuKeyboard());
      }
      return true;
    }

    case 'ADMIN_AD_WAITING_IMAGE': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Création annulée.`);
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      if (text === SKIP_LABEL) {
        setState(telegramUserId, 'ADMIN_AD_WAITING_MESSAGE', { adImage: null });
        await bot.sendMessage(chatId, `Message de la publicité :`, cancelKeyboard());
        return true;
      }
      await bot.sendMessage(
        chatId,
        `Envoyez une photo, ou utilisez un bouton ci-dessous.`,
        skipCancelKeyboard()
      );
      return true;
    }
    case 'ADMIN_AD_WAITING_MESSAGE': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Création annulée.`);
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      setState(telegramUserId, 'ADMIN_AD_WAITING_BUTTON', { adMessage: text });
      await bot.sendMessage(chatId, `Texte du bouton (optionnel) :`, skipCancelKeyboard());
      return true;
    }
    case 'ADMIN_AD_WAITING_BUTTON': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Création annulée.`);
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      const buttonText = text === SKIP_LABEL ? null : text;
      setState(telegramUserId, 'ADMIN_AD_WAITING_URL', { adButtonText: buttonText });
      await bot.sendMessage(chatId, `Lien de la publicité (optionnel) :`, skipCancelKeyboard());
      return true;
    }
    case 'ADMIN_AD_WAITING_URL': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Création annulée.`);
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      const url = text === SKIP_LABEL ? null : text;
      const d = session.data;
      const ad = AdsService.add({
        image: d.adImage || null,
        message: d.adMessage,
        buttonText: d.adButtonText,
        url
      });
      await bot.sendMessage(chatId, `✅ Publicité #${ad.id} créée.`);
      await renderAdsList(bot, chatId, telegramUserId);
      return true;
    }

    case 'ADMIN_AD_DELETE_CONFIRM': {
      if (text === CONFIRM_LABEL) {
        AdsService.remove(session.data.selectedAdId);
        await bot.sendMessage(chatId, `🗑 Publicité supprimée.`);
        await renderAdsList(bot, chatId, telegramUserId);
      } else {
        await renderAdItem(bot, chatId, telegramUserId, session.data.selectedAdId);
      }
      return true;
    }

    case 'ADMIN_AD_BROADCAST_CONFIRM': {
      if (text !== CONFIRM_LABEL && text !== '✅ Diffuser maintenant') {
        await renderAdItem(bot, chatId, telegramUserId, session.data.selectedAdId);
        return true;
      }
      const ad = AdsService.getById(session.data.selectedAdId);
      if (!ad) {
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      await bot.sendMessage(
        chatId,
        `📣 Diffusion en cours, cela peut prendre un moment selon le nombre d'utilisateurs...`
      );
      const result = await broadcastAdToAllUsers(bot, ad);
      setState(telegramUserId, 'ADMIN_IDLE', {
        adminScreen: 'ads',
        adsView: 'item',
        selectedAdId: ad.id
      });
      await bot.sendMessage(
        chatId,
        `📣 <b>Diffusion terminée</b>\n\n` +
          `👥 Destinataires : ${result.total}\n` +
          `✅ Envoyés : ${result.sent}\n` +
          `📌 Épinglés : ${result.pinned}\n` +
          `❌ Échecs : ${result.failed}` +
          (result.failed > 0
            ? `\n<i>(généralement des utilisateurs ayant bloqué le bot)</i>`
            : ''),
        { parse_mode: 'HTML', ...adItemKeyboard(ad) }
      );
      return true;
    }

    case 'ADMIN_SITE_WAITING_NAME': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Annulé.`);
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      setState(telegramUserId, 'ADMIN_SITE_WAITING_DESCRIPTION', { siteName: text });
      await bot.sendMessage(chatId, `Description du site :`, skipCancelKeyboard());
      return true;
    }
    case 'ADMIN_SITE_WAITING_DESCRIPTION': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Annulé.`);
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      const description = text === SKIP_LABEL ? null : text;
      setState(telegramUserId, 'ADMIN_SITE_WAITING_URL', { siteDescription: description });
      await bot.sendMessage(chatId, `URL du site :`, cancelKeyboard());
      return true;
    }
    case 'ADMIN_SITE_WAITING_URL': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Annulé.`);
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      setState(telegramUserId, 'ADMIN_SITE_WAITING_BUTTON', { siteUrl: text });
      await bot.sendMessage(
        chatId,
        `Texte du bouton (optionnel, sinon le nom du site sera utilisé) :`,
        skipCancelKeyboard()
      );
      return true;
    }
    case 'ADMIN_SITE_WAITING_BUTTON': {
      if (text === CANCEL_LABEL) {
        await bot.sendMessage(chatId, `❌ Annulé.`);
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      const d = session.data;
      const buttonText = text === SKIP_LABEL ? d.siteName : text;
      const site = SupportService.addSite({
        name: d.siteName,
        description: d.siteDescription,
        url: d.siteUrl,
        buttonText,
        position: 0
      });
      await bot.sendMessage(chatId, `✅ Site "${site.name}" ajouté.`);
      await renderSitesList(bot, chatId, telegramUserId);
      return true;
    }

    case 'ADMIN_SITE_DELETE_CONFIRM': {
      if (text === CONFIRM_LABEL) {
        SupportService.removeSite(session.data.selectedSiteId);
        await bot.sendMessage(chatId, `🗑 Site supprimé.`);
        await renderSitesList(bot, chatId, telegramUserId);
      } else {
        await renderSiteItem(bot, chatId, telegramUserId, session.data.selectedSiteId);
      }
      return true;
    }

    case 'ADMIN_SUPPORT_WAITING_INFO': {
      if (text === CANCEL_LABEL) {
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'support', supportView: 'menu' });
        await bot.sendMessage(chatId, `❌ Annulé.`, supportMenuKeyboard());
        return true;
      }
      SupportService.setInfoText(text);
      setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'support', supportView: 'menu' });
      await bot.sendMessage(chatId, `✅ Informations mises à jour.`, supportMenuKeyboard());
      return true;
    }

    default:
      break; // pas une saisie en cours : on tente une navigation de menu ci-dessous
  }

  if (!session.data.adminScreen) return false;
  return handleAdminMenuTap(bot, msg, session, text);
}

// ------------------------------------------------------------------
// Navigation dans les menus (appui sur un bouton de clavier persistant)
// ------------------------------------------------------------------
async function handleAdminMenuTap(bot, msg, session, text) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  const screen = session.data.adminScreen;

  if (screen === 'main') {
    if (text === '📊 Statistiques') {
      await showStats(bot, chatId);
      return true;
    }
    if (text === '🔑 Clés API') {
      setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'api' });
      await bot.sendMessage(chatId, `🔑 <b>Gestion des clés API</b>`, {
        parse_mode: 'HTML',
        ...apiMenuKeyboard()
      });
      return true;
    }
    if (text === '📢 Publicités') {
      await renderAdsList(bot, chatId, telegramUserId);
      return true;
    }
    if (text === '🤝 Soutien') {
      setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'support', supportView: 'menu' });
      await bot.sendMessage(chatId, `🤝 <b>Gestion du Soutien</b>`, {
        parse_mode: 'HTML',
        ...supportMenuKeyboard()
      });
      return true;
    }
    if (text === QUIT_LABEL) {
      resetSession(telegramUserId);
      await bot.sendMessage(chatId, `Panel administrateur fermé.`, mainMenuKeyboard(telegramUserId));
      return true;
    }
    await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
    return true;
  }

  if (screen === 'api') {
    if (text === BACK_LABEL) {
      await openAdminPanel(bot, chatId, telegramUserId);
      return true;
    }
    if (text === '📊 Détails des clés') {
      await showApiKeyStats(bot, chatId);
      return true;
    }
    if (text === '➕ Ajouter une clé') {
      setState(telegramUserId, 'ADMIN_WAITING_NEW_KEY', {});
      await bot.sendMessage(chatId, `Envoyez la clé API Agnes :`, cancelKeyboard());
      return true;
    }
    if (text === '🗑 Supprimer une clé') {
      const keys = ApiKeyManager.listAll();
      if (keys.length === 0) {
        await bot.sendMessage(chatId, `Aucune clé à supprimer.`, apiMenuKeyboard());
        return true;
      }
      setState(telegramUserId, 'ADMIN_WAITING_KEY_DELETE_SELECT', {});
      await bot.sendMessage(chatId, `Sélectionnez la clé à supprimer :`, keyDeleteSelectKeyboard(keys));
      return true;
    }
    await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
    return true;
  }

  if (screen === 'ads') {
    if (text === '➕ Ajouter une publicité') {
      setState(telegramUserId, 'ADMIN_AD_WAITING_IMAGE', { adminScreen: 'ads' });
      await bot.sendMessage(
        chatId,
        `Envoyez l'image de la publicité, ou "${SKIP_LABEL}" pour ne pas en mettre :`,
        skipCancelKeyboard()
      );
      return true;
    }

    if (session.data.adsView === 'item' && session.data.selectedAdId) {
      const ad = AdsService.getById(session.data.selectedAdId);
      if (!ad) {
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      if (text === BACK_TO_LIST_LABEL) {
        await renderAdsList(bot, chatId, telegramUserId);
        return true;
      }
      if (text === '🟢 Activer' || text === '🔴 Désactiver') {
        AdsService.setActive(ad.id, ad.active ? 0 : 1);
        await renderAdItem(bot, chatId, telegramUserId, ad.id);
        return true;
      }
      if (text === '🗑 Supprimer') {
        setState(telegramUserId, 'ADMIN_AD_DELETE_CONFIRM', { selectedAdId: ad.id });
        await bot.sendMessage(
          chatId,
          `⚠️ Supprimer définitivement la publicité #${ad.id} ?`,
          confirmCancelKeyboard()
        );
        return true;
      }
      if (text === '📣 Diffuser à tous') {
        const total = db.prepare('SELECT COUNT(*) c FROM users').get().c;
        setState(telegramUserId, 'ADMIN_AD_BROADCAST_CONFIRM', { selectedAdId: ad.id });
        await bot.sendMessage(
          chatId,
          `⚠️ Envoyer cette publicité en message privé à ${total} utilisateur(s) et tenter de l'épingler chez chacun d'eux ?`,
          confirmCancelKeyboard('✅ Diffuser maintenant')
        );
        return true;
      }
      await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
      return true;
    }

    // Vue liste (par défaut)
    if (text === BACK_LABEL) {
      await openAdminPanel(bot, chatId, telegramUserId);
      return true;
    }
    const adId = extractId(text);
    if (adId) {
      await renderAdItem(bot, chatId, telegramUserId, adId);
      return true;
    }
    await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
    return true;
  }

  if (screen === 'support') {
    const view = session.data.supportView || 'menu';

    if (view === 'menu') {
      if (text === BACK_LABEL) {
        await openAdminPanel(bot, chatId, telegramUserId);
        return true;
      }
      if (text === "✏️ Modifier le texte d'info") {
        setState(telegramUserId, 'ADMIN_SUPPORT_WAITING_INFO', {});
        await bot.sendMessage(chatId, `Envoyez le nouveau texte d'information :`, cancelKeyboard());
        return true;
      }
      if (text === '🌐 Gérer les sites') {
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
      return true;
    }

    if (view === 'sites-list') {
      if (text === BACK_LABEL) {
        setState(telegramUserId, 'ADMIN_IDLE', { adminScreen: 'support', supportView: 'menu' });
        await bot.sendMessage(chatId, `🤝 <b>Gestion du Soutien</b>`, {
          parse_mode: 'HTML',
          ...supportMenuKeyboard()
        });
        return true;
      }
      if (text === '➕ Ajouter un site') {
        setState(telegramUserId, 'ADMIN_SITE_WAITING_NAME', {});
        await bot.sendMessage(chatId, `Nom du site :`, cancelKeyboard());
        return true;
      }
      const siteId = extractId(text);
      if (siteId) {
        await renderSiteItem(bot, chatId, telegramUserId, siteId);
        return true;
      }
      await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
      return true;
    }

    if (view === 'site-item' && session.data.selectedSiteId) {
      const site = SupportService.getSite(session.data.selectedSiteId);
      if (!site) {
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      if (text === BACK_TO_LIST_LABEL) {
        await renderSitesList(bot, chatId, telegramUserId);
        return true;
      }
      if (text === '🟢 Activer' || text === '🔴 Désactiver') {
        SupportService.updateSite(site.id, { active: site.active ? 0 : 1 });
        await renderSiteItem(bot, chatId, telegramUserId, site.id);
        return true;
      }
      if (text === '🗑 Supprimer') {
        setState(telegramUserId, 'ADMIN_SITE_DELETE_CONFIRM', { selectedSiteId: site.id });
        await bot.sendMessage(chatId, `⚠️ Supprimer le site "${site.name}" ?`, confirmCancelKeyboard());
        return true;
      }
      await bot.sendMessage(chatId, `Merci d'utiliser les boutons du clavier ci-dessous.`);
      return true;
    }
  }

  return false;
}

module.exports = {
  isAdmin,
  openAdminPanel,
  handleAdminTextInput,
  handleAdminPhotoInput
};

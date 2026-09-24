const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { escapeMarkdown, sendMarkdownSafe } = require('../utils/helpers');
const { getSession, setState, resetSession } = require('../utils/session');
const MembershipService = require('../services/membership');
const CooldownService = require('../services/cooldown');
const ApiKeyManager = require('../services/api-manager');
const VideoManager = require('../services/video-manager');
const AdsService = require('../services/ads');
const { channelRequiredKeyboard, mainMenuKeyboard } = require('../keyboards/main');
const {
  formatKeyboard,
  styleKeyboard,
  durationKeyboard,
  confirmationKeyboard,
  editChoiceKeyboard,
  afterVideoKeyboard
} = require('../keyboards/video');

if (!fs.existsSync(config.tempDir)) fs.mkdirSync(config.tempDir, { recursive: true });

// ------------------------------------------------------------------
// Vérifications préalables
// ------------------------------------------------------------------
async function ensureChannelMember(bot, chatId, telegramUserId) {
  const isMember = await MembershipService.isMember(bot, telegramUserId);
  if (!isMember) {
    await bot.sendMessage(
      chatId,
      `📢 *Abonnement requis*\n\nPour utiliser Darkdeku225 AI Video gratuitement, vous devez rejoindre notre canal officiel.`,
      { parse_mode: 'Markdown', ...channelRequiredKeyboard() }
    );
  }
  return isMember;
}

// ------------------------------------------------------------------
// Démarrage du workflow
// ------------------------------------------------------------------
async function startVideoCreation(bot, msg) {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  const isMember = await ensureChannelMember(bot, chatId, telegramUserId);
  if (!isMember) return;

  const remaining = CooldownService.getRemainingSeconds(telegramUserId);
  if (remaining > 0) {
    await bot.sendMessage(
      chatId,
      `⏳ Vous devez patienter encore ${remaining} seconde(s) avant de lancer une nouvelle génération.`
    );
    return;
  }

  if (!ApiKeyManager.hasAvailableKey()) {
    await bot.sendMessage(
      chatId,
      `❌ Le service est momentanément indisponible (aucune clé API active).\nVeuillez réessayer dans quelques instants.`
    );
    return;
  }

  resetSession(telegramUserId);
  setState(telegramUserId, 'WAITING_IMAGE', {});
  await bot.sendMessage(chatId, `🖼️ Envoyez l'image que vous souhaitez transformer en vidéo.`);
}

// ------------------------------------------------------------------
// Réception de l'image
// ------------------------------------------------------------------
async function handlePhoto(bot, msg) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  const session = getSession(telegramUserId);
  if (session.state !== 'WAITING_IMAGE') return false;

  try {
    const photos = msg.photo;
    const best = photos[photos.length - 1]; // Telegram trie du plus petit au plus grand
    const fileLink = await bot.getFileLink(best.file_id);

    const response = await fetch(fileLink);
    if (!response.ok) throw new Error(`Téléchargement image échoué (HTTP ${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${telegramUserId}_${Date.now()}.jpg`;
    const filePath = path.join(config.tempDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;

    setState(telegramUserId, 'WAITING_PROMPT', {
      imagePath: filePath,
      imageBase64: base64Image,
      imageWidth: best.width,
      imageHeight: best.height
    });

    await bot.sendMessage(
      chatId,
      `✍️ Décrivez maintenant ce que vous souhaitez voir se produire dans la vidéo.\n\n` +
        `_Exemple : « La personne marche lentement vers la caméra, ses cheveux bougent légèrement avec le vent, mouvement de caméra cinématographique et éclairage naturel. »_`,
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (err) {
    logger.error('Erreur réception image', { telegramUserId, message: err.message });
    await bot.sendMessage(
      chatId,
      `❌ Impossible de récupérer votre image. Veuillez réessayer avec une autre photo.`
    );
    return true;
  }
}

// ------------------------------------------------------------------
// Réception du texte (prompt, ou entrées admin gérées ailleurs)
// ------------------------------------------------------------------
async function handlePromptText(bot, msg) {
  const telegramUserId = msg.from.id;
  const chatId = msg.chat.id;
  const session = getSession(telegramUserId);
  if (session.state !== 'WAITING_PROMPT') return false;

  const prompt = (msg.text || '').trim();
  if (!prompt) {
    await bot.sendMessage(chatId, `✍️ Merci d'envoyer une description textuelle.`);
    return true;
  }

  setState(telegramUserId, 'WAITING_FORMAT', { prompt });
  await bot.sendMessage(chatId, `📐 Choisissez le format de la vidéo :`, formatKeyboard());
  return true;
}

// ------------------------------------------------------------------
// Construction du prompt final (prompt utilisateur + style, sans le détruire)
// ------------------------------------------------------------------
function buildFinalPrompt(userPrompt, styleKey) {
  const style = config.styles[styleKey] || config.styles.none;
  if (!style.suffix) return userPrompt;
  return `${userPrompt} ${style.suffix}`;
}

function resolveFormat(formatChoice, imageWidth, imageHeight) {
  if (formatChoice === '9:16' || formatChoice === '16:9') return formatChoice;
  // Auto : déduit le format à partir des proportions réelles de l'image envoyée
  if (imageHeight && imageWidth && imageHeight > imageWidth) return '9:16';
  return '16:9';
}

function resolveDuration(durationChoice) {
  if (config.durations[durationChoice]) return durationChoice;
  return config.defaultDurationKey; // Auto -> durée par défaut raisonnable
}

async function sendRecap(bot, chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  const d = session.data;
  const formatLabel = config.formats[d.format]?.label || d.format;
  const durationLabel = config.durations[d.durationKey]?.label || d.durationKey;
  const styleLabel = config.styles[d.styleKey || 'none'].label;

  const text =
    `🎬 *Nouvelle vidéo*\n\n` +
    `🖼️ Image : reçue\n` +
    `✍️ Prompt : ${escapeMarkdown(d.prompt)}\n` +
    `📐 Format : ${formatLabel}\n` +
    `✨ Style : ${styleLabel}\n` +
    `⏱️ Durée : ${durationLabel}`;

  setState(telegramUserId, 'CONFIRMATION', {});
  await sendMarkdownSafe(bot, chatId, text, confirmationKeyboard());
}

// ------------------------------------------------------------------
// Callback queries du workflow vidéo (retourne true si géré ici)
// ------------------------------------------------------------------
async function handleVideoCallback(bot, query) {
  const telegramUserId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(telegramUserId);

  if (data === 'check_membership') {
    const isMember = await MembershipService.isMember(bot, telegramUserId);
    if (isMember) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Abonnement confirmé !' });
      await bot.sendMessage(chatId, `✅ Merci ! Vous pouvez maintenant utiliser le bot.`, {
        ...mainMenuKeyboard(telegramUserId)
      });
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: "❌ Vous n'êtes pas encore abonné au canal. Rejoignez-le puis réessayez.",
        show_alert: true
      });
    }
    return true;
  }

  if (data.startsWith('format_')) {
    if (session.state !== 'WAITING_FORMAT' && session.state !== 'CONFIRMATION') return true;
    const choice = data.replace('format_', '');
    const format = resolveFormat(choice, session.data.imageWidth, session.data.imageHeight);
    setState(telegramUserId, 'WAITING_STYLE', { format });
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `✨ Voulez-vous ajouter un style ?`, styleKeyboard());
    return true;
  }

  if (data.startsWith('style_')) {
    if (session.state !== 'WAITING_STYLE' && session.state !== 'CONFIRMATION') return true;
    const styleKey = data.replace('style_', '');
    setState(telegramUserId, 'WAITING_DURATION', { styleKey });
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `⏱️ Choisissez la durée :`, durationKeyboard());
    return true;
  }

  if (data.startsWith('duration_')) {
    if (session.state !== 'WAITING_DURATION' && session.state !== 'CONFIRMATION') return true;
    const choice = data.replace('duration_', '');
    const durationKey = resolveDuration(choice);
    setState(telegramUserId, 'CONFIRMATION', { durationKey });
    await bot.answerCallbackQuery(query.id);
    await sendRecap(bot, chatId, telegramUserId);
    return true;
  }

  if (data === 'confirm_edit') {
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `✏️ Que souhaitez-vous modifier ?`, editChoiceKeyboard());
    return true;
  }

  if (data === 'confirm_cancel') {
    resetSession(telegramUserId);
    await bot.answerCallbackQuery(query.id, { text: 'Annulé.' });
    await bot.sendMessage(chatId, `❌ Création annulée.`, { ...mainMenuKeyboard(telegramUserId) });
    return true;
  }

  if (data === 'edit_image') {
    setState(telegramUserId, 'WAITING_IMAGE', {});
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `🖼️ Envoyez la nouvelle image.`);
    return true;
  }
  if (data === 'edit_prompt') {
    setState(telegramUserId, 'WAITING_PROMPT', {});
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `✍️ Envoyez le nouveau prompt.`);
    return true;
  }
  if (data === 'edit_format') {
    setState(telegramUserId, 'WAITING_FORMAT', {});
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `📐 Choisissez le format de la vidéo :`, formatKeyboard());
    return true;
  }
  if (data === 'edit_style') {
    setState(telegramUserId, 'WAITING_STYLE', {});
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `✨ Voulez-vous ajouter un style ?`, styleKeyboard());
    return true;
  }
  if (data === 'edit_duration') {
    setState(telegramUserId, 'WAITING_DURATION', {});
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `⏱️ Choisissez la durée :`, durationKeyboard());
    return true;
  }
  if (data === 'edit_back') {
    await bot.answerCallbackQuery(query.id);
    await sendRecap(bot, chatId, telegramUserId);
    return true;
  }

  if (data === 'new_video') {
    await bot.answerCallbackQuery(query.id);
    await startVideoCreation(bot, { chat: { id: chatId }, from: query.from });
    return true;
  }

  if (data === 'confirm_generate') {
    await bot.answerCallbackQuery(query.id);
    await runGeneration(bot, chatId, telegramUserId);
    return true;
  }

  return false;
}

// ------------------------------------------------------------------
// Envoi de la vidéo : téléchargement côté serveur puis envoi en fichier
// (Telegram n'arrive pas toujours à récupérer lui-même l'URL Agnes, et l'envoi par URL
// est limité à 20 Mo ; l'envoi en fichier accepte jusqu'à 50 Mo et conserve le format).
// ------------------------------------------------------------------
const MAX_TELEGRAM_UPLOAD_BYTES = 49 * 1024 * 1024;

async function deliverVideo(bot, chatId, videoUrl, { width, height, duration, jobId }) {
  const tmpPath = path.join(config.tempDir, `video_${jobId}_${Date.now()}.mp4`);
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Téléchargement vidéo échoué (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_TELEGRAM_UPLOAD_BYTES) {
      throw new Error(`Vidéo trop lourde pour Telegram (${buffer.length} octets)`);
    }
    fs.writeFileSync(tmpPath, buffer);

    await bot.sendVideo(
      chatId,
      fs.createReadStream(tmpPath),
      { width, height, duration, supports_streaming: true },
      { filename: `darkdeku225_${jobId}.mp4`, contentType: 'video/mp4' }
    );
  } catch (err) {
    logger.warn('Envoi de la vidéo en fichier impossible, envoi du lien', {
      jobId,
      message: err.message
    });
    await bot.sendMessage(chatId, `🎬 Votre vidéo : ${videoUrl}`);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => {});
  }
}

// ------------------------------------------------------------------
// Génération finale
// ------------------------------------------------------------------
async function runGeneration(bot, chatId, telegramUserId) {
  const session = getSession(telegramUserId);
  const d = session.data;

  // Re-vérifications de sécurité juste avant de lancer (cooldown / clé / abonnement)
  const remaining = CooldownService.getRemainingSeconds(telegramUserId);
  if (remaining > 0) {
    await bot.sendMessage(
      chatId,
      `⏳ Vous devez patienter encore ${remaining} seconde(s) avant de lancer une nouvelle génération.`
    );
    return;
  }
  if (!ApiKeyManager.hasAvailableKey()) {
    await bot.sendMessage(
      chatId,
      `❌ Le service est momentanément indisponible (aucune clé API active).\nVeuillez réessayer dans quelques instants.`
    );
    return;
  }

  const format = d.format || 'auto';
  const resolvedFormat = format === '9:16' || format === '16:9' ? format : '16:9';
  const { width, height } = config.formats[resolvedFormat];
  const durationKey = d.durationKey || config.defaultDurationKey;
  const durationSeconds = config.durations[durationKey].seconds;
  const finalPrompt = buildFinalPrompt(d.prompt, d.styleKey || 'none');

  const job = VideoManager.createJob({
    telegramUserId,
    prompt: finalPrompt,
    style: d.styleKey || 'none',
    format: resolvedFormat,
    durationSeconds,
    width,
    height
  });

  CooldownService.start(telegramUserId);
  setState(telegramUserId, 'GENERATING', {});

  const progressMsg = await bot.sendMessage(chatId, `⏳ Préparation de votre vidéo...`);

  let lastEditedText = '';
  const onProgress = (status, progress) => {
    let text = `🎬 Génération en cours...`;
    if (status === 'queued') text = `⏳ Votre vidéo est en file d'attente...`;
    if (typeof progress === 'number') text += `\n\nProgression : ${Math.round(progress)} %`;
    if (text !== lastEditedText) {
      lastEditedText = text;
      bot
        .editMessageText(text, { chat_id: chatId, message_id: progressMsg.message_id })
        .catch(() => {});
    }
  };

  try {
    const videoUrl = await VideoManager.runJob(job.id, {
      imageBase64OrUrl: d.imageBase64,
      onProgress
    });

    await bot
      .editMessageText(`✅ Votre vidéo est prête !`, {
        chat_id: chatId,
        message_id: progressMsg.message_id
      })
      .catch(() => {});

    await deliverVideo(bot, chatId, videoUrl, {
      width,
      height,
      duration: durationSeconds,
      jobId: job.id
    });

    await bot.sendMessage(chatId, `Envie de continuer ?`, afterVideoKeyboard());

    maybeShowAd(bot, chatId, telegramUserId);
  } catch (err) {
    logger.error('Échec génération vidéo', { telegramUserId, jobId: job.id, message: err.message });
    await bot
      .editMessageText(
        `❌ La génération n'a pas pu être terminée.\n\nNotre service vidéo rencontre actuellement un problème.\nVeuillez réessayer dans quelques instants.`,
        { chat_id: chatId, message_id: progressMsg.message_id }
      )
      .catch(() => {});
  } finally {
    // Nettoyage du fichier image temporaire
    if (d.imagePath && fs.existsSync(d.imagePath)) {
      fs.unlink(d.imagePath, () => {});
    }
    resetSession(telegramUserId);
  }
}

async function maybeShowAd(bot, chatId, telegramUserId) {
  try {
    const db = require('../database');
    const completedCount = db
      .prepare(
        `SELECT COUNT(*) c FROM video_jobs WHERE telegram_user_id = ? AND status = 'completed'`
      )
      .get(telegramUserId).c;
    const frequency = AdsService.getAdsFrequency();
    if (frequency > 0 && completedCount % frequency === 0) {
      const ad = AdsService.pickOneToShow();
      if (!ad) return;
      const keyboard = ad.url
        ? { reply_markup: { inline_keyboard: [[{ text: ad.button_text || 'En savoir plus', url: ad.url }]] } }
        : {};
      if (ad.image) {
        await bot.sendPhoto(chatId, ad.image, { caption: ad.message, ...keyboard });
      } else {
        await bot.sendMessage(chatId, ad.message, keyboard);
      }
    }
  } catch (err) {
    logger.warn('Erreur affichage publicité', { message: err.message });
  }
}

module.exports = {
  startVideoCreation,
  handlePhoto,
  handlePromptText,
  handleVideoCallback,
  ensureChannelMember
};

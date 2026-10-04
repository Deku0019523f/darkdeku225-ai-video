const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const MembershipService = require('../services/membership');
const CooldownService = require('../services/cooldown');
const ApiKeyManager = require('../services/api-manager');
const VideoManager = require('../services/video-manager');
const AdsService = require('../services/ads');
const { buildFinalPrompt, resolveFormat, resolveDuration } = require('../services/video-workflow');

function pickAdIfDue(telegramUserId, jobId) {
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
      if (ad) VideoManager.setAd(jobId, ad);
    }
  } catch (err) {
    logger.warn('Erreur sélection publicité', { message: err.message });
  }
}

function runGenerationInBackground(bot, job, telegramUserId, imageBase64) {
  VideoManager.runJob(job.id, {
    imageBase64OrUrl: imageBase64,
    onProgress: (status, progress) => {
      VideoManager.setProgress(job.id, progress);
    }
  })
    .then(async (videoUrl) => {
      pickAdIfDue(telegramUserId, job.id);
      try {
        // Envoie aussi la vidéo dans le chat Telegram pour qu'elle reste accessible
        // même après fermeture de la Mini App.
        await bot.sendVideo(telegramUserId, videoUrl);
      } catch (err) {
        logger.warn("Échec de l'envoi de la vidéo dans le chat", {
          telegramUserId,
          message: err.message
        });
      }
    })
    .catch(() => {
      // Déjà loggué et persisté (status = failed) dans VideoManager.runJob
    });
}

module.exports = function videoRoutes(bot) {
  const router = express.Router();

  router.post('/generate', async (req, res) => {
    const telegramUserId = req.telegramUser.id;
    const { imageBase64, prompt, format, style, duration, imageWidth, imageHeight } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Image manquante.' });
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt manquant.' });
    }

    const isMember = await MembershipService.isMember(bot, telegramUserId);
    if (!isMember) {
      return res.status(403).json({
        error: 'channel_required',
        channelLink: config.telegram.requiredChannelLink
      });
    }

    const remaining = CooldownService.getRemainingSeconds(telegramUserId);
    if (remaining > 0) {
      return res.status(429).json({ error: 'cooldown', remaining });
    }

    if (!ApiKeyManager.hasAvailableKey()) {
      return res.status(503).json({ error: 'no_key_available' });
    }

    const resolvedFormat = resolveFormat(format, imageWidth, imageHeight);
    const { width, height } = config.formats[resolvedFormat];
    const durationKey = resolveDuration(duration);
    const durationSeconds = config.durations[durationKey].seconds;
    const styleKey = config.styles[style] ? style : 'none';
    const finalPrompt = buildFinalPrompt(prompt.trim(), styleKey);

    const job = VideoManager.createJob({
      telegramUserId,
      prompt: finalPrompt,
      style: styleKey,
      format: resolvedFormat,
      durationSeconds,
      width,
      height
    });

    CooldownService.start(telegramUserId);
    runGenerationInBackground(bot, job, telegramUserId, imageBase64);

    res.status(202).json({ jobId: job.id, cooldownSeconds: config.bot.cooldownSeconds });
  });

  router.get('/job/:id', (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    const job = VideoManager.getJob(jobId);
    if (!job || job.telegram_user_id !== req.telegramUser.id) {
      return res.status(404).json({ error: 'Tâche introuvable.' });
    }
    res.json({
      id: job.id,
      status: job.status,
      progress: VideoManager.getProgress(job.id),
      videoUrl: job.video_url,
      errorMessage:
        job.status === 'failed'
          ? "La génération n'a pas pu être terminée. Veuillez réessayer dans quelques instants."
          : null,
      ad: job.status === 'completed' ? VideoManager.getAd(job.id) : null
    });
  });

  return router;
};

const express = require('express');
const config = require('../config');
const MembershipService = require('../services/membership');
const CooldownService = require('../services/cooldown');
const ApiKeyManager = require('../services/api-manager');
const SupportService = require('../services/support');
const { upsertUser, touchLastSeen } = require('../handlers/start');

module.exports = function commonRoutes(bot) {
  const router = express.Router();

  // Upsert + last_seen à chaque appel authentifié (le middleware requireTelegramAuth
  // a déjà validé la signature et attaché req.telegramUser avant d'arriver ici).
  router.use((req, res, next) => {
    try {
      upsertUser(req.telegramUser);
      touchLastSeen(req.telegramUser.id);
    } catch (_) {
      // ne bloque jamais la requête pour un souci d'upsert
    }
    next();
  });

  // Statut global consommé par l'écran d'accueil de la Mini App
  router.get('/status', async (req, res) => {
    const telegramUserId = req.telegramUser.id;
    const isMember = await MembershipService.isMember(bot, telegramUserId);
    const cooldownRemaining = CooldownService.getRemainingSeconds(telegramUserId);
    const keysAvailable = ApiKeyManager.hasAvailableKey();
    res.json({
      isMember,
      channelLink: config.telegram.requiredChannelLink,
      cooldownRemaining,
      keysAvailable,
      isAdmin: telegramUserId === config.telegram.adminId
    });
  });

  router.get('/membership', async (req, res) => {
    const isMember = await MembershipService.isMember(bot, req.telegramUser.id);
    res.json({ isMember, channelLink: config.telegram.requiredChannelLink });
  });

  router.get('/support', (req, res) => {
    res.json({
      info: SupportService.getInfoText(),
      sites: SupportService.listSites({ onlyActive: true })
    });
  });

  return router;
};

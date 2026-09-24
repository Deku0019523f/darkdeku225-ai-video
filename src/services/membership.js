const config = require('../config');
const logger = require('../utils/logger');

const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];

const MembershipService = {
  /**
   * Vérifie réellement le statut de l'utilisateur dans le canal via l'API Telegram
   * (getChatMember). Ne fait jamais confiance à un simple clic de bouton.
   */
  async isMember(bot, telegramUserId) {
    const chatId = '@' + config.telegram.requiredChannelUsername;
    try {
      const member = await bot.getChatMember(chatId, telegramUserId);
      return VALID_MEMBER_STATUSES.includes(member.status);
    } catch (err) {
      // Si le bot n'est pas admin du canal ou que l'utilisateur n'a jamais interagi,
      // Telegram peut renvoyer une erreur : on considère alors l'utilisateur non membre
      // plutôt que de planter, mais on logue pour diagnostic.
      logger.warn('Échec vérification abonnement canal', {
        telegramUserId,
        message: err.message
      });
      return false;
    }
  }
};

module.exports = MembershipService;

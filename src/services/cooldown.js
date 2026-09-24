const db = require('../database');
const config = require('../config');

const CooldownService = {
  /**
   * Retourne le nombre de secondes restantes avant la prochaine génération autorisée
   * pour cet utilisateur, ou 0 si aucun cooldown actif.
   */
  getRemainingSeconds(telegramUserId) {
    const row = db
      .prepare('SELECT expires_at FROM cooldowns WHERE telegram_user_id = ?')
      .get(telegramUserId);
    if (!row) return 0;
    const remainingMs = new Date(row.expires_at).getTime() - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  },

  isActive(telegramUserId) {
    return this.getRemainingSeconds(telegramUserId) > 0;
  },

  /**
   * Démarre (ou redémarre) le cooldown de l'utilisateur pour la durée configurée.
   */
  start(telegramUserId, seconds = config.bot.cooldownSeconds) {
    const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
    db.prepare(
      `INSERT INTO cooldowns (telegram_user_id, expires_at) VALUES (?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET expires_at = excluded.expires_at`
    ).run(telegramUserId, expiresAt);
  },

  clear(telegramUserId) {
    db.prepare('DELETE FROM cooldowns WHERE telegram_user_id = ?').run(telegramUserId);
  }
};

module.exports = CooldownService;

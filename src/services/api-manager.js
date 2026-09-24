const db = require('../database');
const { encrypt, decrypt, maskKey } = require('../utils/helpers');
const logger = require('../utils/logger');

// Index utilisé pour faire tourner les clés en round-robin entre les appels.
let rotationCursor = 0;

// Motifs qui indiquent une erreur de quota / rate limit côté Agnes.
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota/i,
  /too many requests/i,
  /limit exceeded/i
];

function isRateLimitError(httpStatus, bodyText) {
  if (httpStatus === 429) return true;
  if (!bodyText) return false;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(bodyText));
}

const ApiKeyManager = {
  /**
   * Ajoute une nouvelle clé Agnes (chiffrée en base).
   */
  addKey(rawKey) {
    const trimmed = (rawKey || '').trim();
    if (!trimmed || trimmed.length < 8) {
      throw new Error('Format de clé invalide (trop courte).');
    }
    const encrypted = encrypt(trimmed);
    const masked = maskKey(trimmed);
    const stmt = db.prepare(
      `INSERT INTO api_keys (encrypted_key, masked_key, status) VALUES (?, ?, 'active')`
    );
    const info = stmt.run(encrypted, masked);
    logger.info('Nouvelle clé API Agnes ajoutée', { id: info.lastInsertRowid, masked });
    return this.getById(info.lastInsertRowid);
  },

  removeKey(id) {
    const key = this.getById(id);
    if (!key) return false;
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    logger.info('Clé API Agnes supprimée', { id, masked: key.masked_key });
    return true;
  },

  setStatus(id, status) {
    db.prepare('UPDATE api_keys SET status = ? WHERE id = ?').run(status, id);
  },

  getById(id) {
    return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  },

  listAll() {
    return db.prepare('SELECT * FROM api_keys ORDER BY id ASC').all();
  },

  /**
   * Réactive automatiquement les clés dont le cooldown ("disabled_until") est expiré.
   */
  _reactivateExpiredCooldowns() {
    const now = new Date().toISOString();
    const expired = db
      .prepare(
        `SELECT id FROM api_keys WHERE status = 'limited' AND disabled_until IS NOT NULL AND disabled_until <= ?`
      )
      .all(now);
    for (const row of expired) {
      db.prepare(
        `UPDATE api_keys SET status = 'active', disabled_until = NULL WHERE id = ?`
      ).run(row.id);
      logger.info('Clé API réactivée après cooldown', { id: row.id });
    }
  },

  /**
   * Sélectionne la prochaine clé disponible en rotation (round-robin),
   * en sautant les clés désactivées ou en limite.
   */
  getNextAvailableKey() {
    this._reactivateExpiredCooldowns();
    const active = db
      .prepare(`SELECT * FROM api_keys WHERE status = 'active' ORDER BY id ASC`)
      .all();
    if (active.length === 0) return null;

    rotationCursor = rotationCursor % active.length;
    const selected = active[rotationCursor];
    rotationCursor = (rotationCursor + 1) % active.length;

    return { ...selected, plainKey: decrypt(selected.encrypted_key) };
  },

  hasAvailableKey() {
    this._reactivateExpiredCooldowns();
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM api_keys WHERE status = 'active'`)
      .get();
    return row.c > 0;
  },

  recordUsage(id) {
    db.prepare(
      `UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = datetime('now') WHERE id = ?`
    ).run(id);
  },

  recordSuccess(id) {
    db.prepare(
      `UPDATE api_keys SET success_count = success_count + 1 WHERE id = ?`
    ).run(id);
  },

  recordError(id) {
    db.prepare(`UPDATE api_keys SET error_count = error_count + 1 WHERE id = ?`).run(id);
  },

  /**
   * Met une clé en cooldown suite à une erreur de quota/rate-limit.
   * cooldownMinutes: durée avant réactivation automatique.
   */
  putInCooldown(id, cooldownMinutes = 30) {
    const disabledUntil = new Date(Date.now() + cooldownMinutes * 60000).toISOString();
    db.prepare(
      `UPDATE api_keys
       SET status = 'limited', rate_limit_count = rate_limit_count + 1, disabled_until = ?
       WHERE id = ?`
    ).run(disabledUntil, id);
    logger.warn('Clé API mise en cooldown', { id, disabledUntil });
  },

  isRateLimitError,

  getStats() {
    const total = db.prepare('SELECT COUNT(*) as c FROM api_keys').get().c;
    const available = db
      .prepare(`SELECT COUNT(*) as c FROM api_keys WHERE status = 'active'`)
      .get().c;
    const limited = db
      .prepare(`SELECT COUNT(*) as c FROM api_keys WHERE status = 'limited'`)
      .get().c;
    const disabled = db
      .prepare(`SELECT COUNT(*) as c FROM api_keys WHERE status = 'disabled'`)
      .get().c;
    return { total, available, limited, disabled };
  }
};

module.exports = ApiKeyManager;

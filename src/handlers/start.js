const db = require('../database');
const config = require('../config');
const logger = require('../utils/logger');

function upsertUser(from) {
  const isAdmin = from.id === config.telegram.adminId ? 1 : 0;
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(from.id);
  if (existing) {
    db.prepare(
      `UPDATE users SET username = ?, first_name = ?, is_admin = ?, last_seen_at = datetime('now')
       WHERE telegram_id = ?`
    ).run(from.username || null, from.first_name || null, isAdmin, from.id);
  } else {
    db.prepare(
      `INSERT INTO users (telegram_id, username, first_name, is_admin) VALUES (?, ?, ?, ?)`
    ).run(from.id, from.username || null, from.first_name || null, isAdmin);
    logger.info('Nouvel utilisateur', { telegramUserId: from.id, username: from.username });
  }
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(from.id);
}

function touchLastSeen(telegramUserId) {
  db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE telegram_id = ?`).run(
    telegramUserId
  );
}

module.exports = { upsertUser, touchLastSeen };

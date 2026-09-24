const db = require('../database');
const config = require('../config');
const { mainMenuKeyboard } = require('../keyboards/main');
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

async function handleStart(bot, msg) {
  const user = upsertUser(msg.from);
  const welcome =
    `🎬 *Bienvenue sur Darkdeku225 AI Video*\n\n` +
    `Transformez une simple image en vidéo animée grâce à l'intelligence artificielle.\n\n` +
    `Utilisez le menu ci-dessous pour commencer, ou appuyez sur *ℹ️ Aide* pour tout savoir sur le fonctionnement du bot.`;
  await bot.sendMessage(msg.chat.id, welcome, {
    parse_mode: 'Markdown',
    ...mainMenuKeyboard(user.telegram_id)
  });
}

module.exports = { handleStart, upsertUser, touchLastSeen };

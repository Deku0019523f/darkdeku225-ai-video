const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

// S'assure que le dossier data/ existe
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_channel_member INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_key TEXT NOT NULL,
  masked_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | disabled | limited
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  rate_limit_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  disabled_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL,
  api_key_id INTEGER,
  prompt TEXT,
  style TEXT,
  format TEXT,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  num_frames INTEGER,
  frame_rate INTEGER,
  agnes_video_id TEXT,
  agnes_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|queued|in_progress|completed|failed
  video_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS cooldowns (
  telegram_user_id INTEGER PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT,
  message TEXT NOT NULL,
  button_text TEXT,
  url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  display_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  button_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

db.exec(SCHEMA);

// Réglage par défaut : texte "Informations" du menu Soutien, modifiable depuis l'admin
const defaultSettings = {
  support_info: JSON.stringify({
    text:
      "Besoin d'aide ou envie de découvrir mes autres projets ?\n\nDéveloppeur indépendant, je conçois des solutions d'automatisation et des bots sur mesure."
  }),
  ads_frequency: '3' // afficher une pub toutes les N vidéos générées avec succès, par exemple
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

logger.info('Base de données SQLite initialisée', { path: config.db.path });

module.exports = db;

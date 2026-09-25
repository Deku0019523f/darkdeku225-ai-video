const crypto = require('crypto');
const config = require('../config');

/**
 * Masque une clé API pour l'affichage : garde seulement les 4 derniers caractères.
 * Ex: "sk-abcdef1234A82F" -> "••••••••••A82F"
 */
function maskKey(rawKey) {
  if (!rawKey || rawKey.length < 4) return '••••';
  const last4 = rawKey.slice(-4);
  return '••••••••••' + last4;
}

// --- Chiffrement AES-256-GCM des clés Agnes stockées en base ---
function getEncryptionKeyBuffer() {
  const raw = config.security.encryptionKey;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY manquante dans .env. Générez-en une avec: openssl rand -hex 32'
    );
  }
  // Dérive une clé 32 octets stable à partir de la valeur fournie (hex, ou texte libre)
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload) {
  const key = getEncryptionKeyBuffer();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * num_frames doit respecter num_frames = 8n + 1 et <= 441 (contrainte Agnes Video V2.0).
 */
function framesForSeconds(seconds, frameRate = config.frameRate) {
  const raw = seconds * frameRate;
  const n = Math.round((raw - 1) / 8);
  let frames = n * 8 + 1;
  if (frames > 441) frames = 441;
  if (frames < 1) frames = 1;
  return frames;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(dateStrOrNull) {
  if (!dateStrOrNull) return 'jamais';
  const d = new Date(dateStrOrNull);
  if (Number.isNaN(d.getTime())) return 'jamais';
  return d.toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' UTC';
}

/**
 * Échappe les caractères spéciaux du Markdown "legacy" de Telegram (_ * ` [).
 * À utiliser sur tout texte dynamique (liens, prompts, noms...) inséré dans un
 * message envoyé avec parse_mode: 'Markdown'.
 */
function escapeMarkdown(text) {
  return String(text ?? '').replace(/([_*`\[])/g, '\\$1');
}

/**
 * Échappe les caractères spéciaux du HTML de Telegram (& < >).
 * À utiliser sur tout texte dynamique inséré dans un message envoyé avec
 * parse_mode: 'HTML' (le panel admin, par exemple).
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Envoie un message en Markdown ; si Telegram refuse de parser les entités
 * ("can't parse entities"), renvoie le même message en texte brut au lieu d'échouer.
 */
async function sendMarkdownSafe(bot, chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, { ...options, parse_mode: 'Markdown' });
  } catch (err) {
    if (/can't parse entities/i.test(err.message || '')) {
      const { parse_mode, ...rest } = options;
      return bot.sendMessage(chatId, text.replace(/\\([_*`\[])/g, '$1'), rest);
    }
    throw err;
  }
}

function safeUserLabel(user) {
  if (!user) return 'inconnu';
  const name = user.first_name || user.username || String(user.telegram_id);
  return user.username ? `${name} (@${user.username})` : name;
}

module.exports = {
  maskKey,
  encrypt,
  decrypt,
  framesForSeconds,
  sleep,
  formatDate,
  escapeMarkdown,
  escapeHtml,
  sendMarkdownSafe,
  safeUserLabel
};

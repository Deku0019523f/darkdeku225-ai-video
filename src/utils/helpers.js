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
  safeUserLabel
};

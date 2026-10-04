/**
 * Validation de l'initData envoyée par le client Telegram Mini App, selon l'algorithme
 * officiel Telegram : https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
 * hash_calculé = HMAC_SHA256(data_check_string, secret_key)
 * La requête est valide si hash_calculé === hash fourni par Telegram.
 */
const crypto = require('crypto');
const config = require('./config');
const logger = require('./utils/logger');

function verifyInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, reason: 'initData manquante' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, reason: 'hash manquant' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.telegram.token)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return { valid: false, reason: 'signature invalide' };
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > config.webapp.initDataMaxAgeSeconds) {
    return { valid: false, reason: 'initData expirée' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (_) {
    user = null;
  }
  if (!user || !user.id) {
    return { valid: false, reason: 'utilisateur introuvable dans initData' };
  }

  return { valid: true, user };
}

/**
 * Middleware Express : exige une initData Telegram valide, envoyée par le client dans
 * l'en-tête "X-Telegram-Init-Data". Attache req.telegramUser en cas de succès.
 */
function requireTelegramAuth(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data');
  const result = verifyInitData(initData);
  if (!result.valid) {
    logger.warn('Authentification Mini App refusée', { reason: result.reason });
    return res.status(401).json({ error: 'Authentification Telegram invalide.' });
  }
  req.telegramUser = result.user;
  next();
}

/**
 * Middleware Express : exige en plus que l'utilisateur authentifié soit l'administrateur.
 * À utiliser après requireTelegramAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.telegramUser || req.telegramUser.id !== config.telegram.adminId) {
    return res.status(403).json({ error: 'Accès réservé à l\'administrateur.' });
  }
  next();
}

module.exports = { verifyInitData, requireTelegramAuth, requireAdmin };

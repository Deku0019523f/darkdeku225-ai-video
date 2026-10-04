const config = require('../config');

/**
 * Construit le prompt final envoyé à Agnes : prompt utilisateur + suffixe de style,
 * sans jamais détruire ou remplacer le prompt original.
 */
function buildFinalPrompt(userPrompt, styleKey) {
  const style = config.styles[styleKey] || config.styles.none;
  if (!style.suffix) return userPrompt;
  return `${userPrompt} ${style.suffix}`;
}

/**
 * Résout le format final ('9:16' | '16:9') à partir du choix utilisateur et,
 * pour "auto", des proportions réelles de l'image envoyée.
 */
function resolveFormat(formatChoice, imageWidth, imageHeight) {
  if (formatChoice === '9:16' || formatChoice === '16:9') return formatChoice;
  if (imageHeight && imageWidth && imageHeight > imageWidth) return '9:16';
  return '16:9';
}

/**
 * Résout la clé de durée finale ('3' | '5' | '10' | '18'), "auto" -> valeur par défaut.
 */
function resolveDuration(durationChoice) {
  if (config.durations[durationChoice]) return durationChoice;
  return config.defaultDurationKey;
}

module.exports = { buildFinalPrompt, resolveFormat, resolveDuration };

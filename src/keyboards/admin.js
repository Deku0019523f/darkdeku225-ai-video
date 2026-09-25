/**
 * Claviers du panel admin : tous en ReplyKeyboardMarkup (boutons persistants en bas
 * de l'écran), comme demandé, plutôt qu'en InlineKeyboardMarkup (boutons sous le
 * message). Chaque écran du panel a son propre clavier ; le workflow vidéo (côté
 * utilisateur) garde ses boutons inline dans keyboards/video.js, non concerné ici.
 */

const SKIP_LABEL = '⏭️ Passer';
const CANCEL_LABEL = '❌ Annuler';
const CONFIRM_LABEL = '✅ Confirmer';
const BACK_LABEL = '⬅️ Retour';
const BACK_TO_LIST_LABEL = '⬅️ Retour à la liste';
const QUIT_LABEL = "🏠 Quitter l'admin";

function kb(rows) {
  return { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true } };
}

/** Ajoute un identifiant traçable à la fin d'un libellé de bouton : "Gérer (#4)". */
function withId(label, id) {
  return `${label} (#${id})`;
}

/** Récupère l'identifiant ajouté par withId() dans le texte d'un bouton pressé. */
function extractId(text) {
  const m = /\(#(\d+)\)\s*$/.exec(text || '');
  return m ? parseInt(m[1], 10) : null;
}

function adminMainKeyboard() {
  return kb([
    ['📊 Statistiques'],
    ['🔑 Clés API', '📢 Publicités'],
    ['🤝 Soutien'],
    [QUIT_LABEL]
  ]);
}

function apiMenuKeyboard() {
  return kb([
    ['📊 Détails des clés'],
    ['➕ Ajouter une clé', '🗑 Supprimer une clé'],
    [BACK_LABEL]
  ]);
}

function adsMenuKeyboard() {
  return kb([['➕ Ajouter une publicité'], [BACK_LABEL]]);
}

function supportMenuKeyboard() {
  return kb([["✏️ Modifier le texte d'info"], ['🌐 Gérer les sites'], [BACK_LABEL]]);
}

function cancelKeyboard() {
  return kb([[CANCEL_LABEL]]);
}

function skipCancelKeyboard() {
  return kb([[SKIP_LABEL], [CANCEL_LABEL]]);
}

function confirmCancelKeyboard(confirmLabel = CONFIRM_LABEL) {
  return kb([[confirmLabel, CANCEL_LABEL]]);
}

function keyDeleteSelectKeyboard(keys) {
  const rows = keys.map((k) => [withId(`🔑 ${k.masked_key}`, k.id)]);
  rows.push([CANCEL_LABEL]);
  return kb(rows);
}

function adsListManageKeyboard(ads) {
  const rows = ads.map((a) => [withId('⚙️ Gérer une publicité', a.id)]);
  rows.push(['➕ Ajouter une publicité']);
  rows.push([BACK_LABEL]);
  return kb(rows);
}

function adItemKeyboard(ad) {
  const toggleLabel = ad.active ? '🔴 Désactiver' : '🟢 Activer';
  return kb([[toggleLabel], ['📣 Diffuser à tous'], ['🗑 Supprimer'], [BACK_TO_LIST_LABEL]]);
}

function sitesListManageKeyboard(sites) {
  const rows = sites.map((s) => [withId(`⚙️ Gérer ${s.name}`, s.id)]);
  rows.push(['➕ Ajouter un site']);
  rows.push([BACK_LABEL]);
  return kb(rows);
}

function siteItemKeyboard(site) {
  const toggleLabel = site.active ? '🔴 Désactiver' : '🟢 Activer';
  return kb([[toggleLabel], ['🗑 Supprimer'], [BACK_TO_LIST_LABEL]]);
}

module.exports = {
  SKIP_LABEL,
  CANCEL_LABEL,
  CONFIRM_LABEL,
  BACK_LABEL,
  BACK_TO_LIST_LABEL,
  QUIT_LABEL,
  withId,
  extractId,
  adminMainKeyboard,
  apiMenuKeyboard,
  adsMenuKeyboard,
  supportMenuKeyboard,
  cancelKeyboard,
  skipCancelKeyboard,
  confirmCancelKeyboard,
  keyDeleteSelectKeyboard,
  adsListManageKeyboard,
  adItemKeyboard,
  sitesListManageKeyboard,
  siteItemKeyboard
};

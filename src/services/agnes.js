/**
 * Service Agnes AI - couche d'abstraction unique pour parler au modèle vidéo.
 *
 * Le nom du modèle (config.agnes.model) n'est JAMAIS dispersé ailleurs dans le code :
 * tout appel à Agnes passe par ce fichier. Le jour où "agnes-video-v2.0" est retiré
 * (25 septembre 2026) il suffit de changer AGNES_MODEL dans .env, et si la forme des
 * paramètres change, seules les fonctions buildCreatePayload()/parseResult() ci-dessous
 * doivent être adaptées.
 */
const config = require('../config');
const ApiKeyManager = require('./api-manager');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

class AgnesError extends Error {
  constructor(message, { httpStatus = null, rateLimited = false, raw = null } = {}) {
    super(message);
    this.name = 'AgnesError';
    this.httpStatus = httpStatus;
    this.rateLimited = rateLimited;
    this.raw = raw;
  }
}

function buildCreatePayload({ prompt, imageBase64OrUrl, width, height, num_frames, frame_rate }) {
  return {
    model: config.agnes.model,
    prompt,
    image: imageBase64OrUrl,
    width,
    height,
    num_frames,
    frame_rate: frame_rate || config.frameRate
  };
}

async function httpJson(url, options) {
  const res = await fetch(url, options);
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch (_) {
    bodyText = '';
  }
  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch (_) {
    json = null;
  }
  return { res, bodyText, json };
}

/**
 * Essaie de créer une tâche vidéo Agnes, en tournant automatiquement sur les clés
 * disponibles si une clé renvoie une erreur de quota/rate-limit.
 * Retourne { videoId, apiKeyId } en cas de succès.
 */
async function createVideoJob(params) {
  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!ApiKeyManager.hasAvailableKey()) {
      throw new AgnesError('Aucune clé API Agnes disponible.', { rateLimited: false });
    }
    const keyRow = ApiKeyManager.getNextAvailableKey();
    if (!keyRow) {
      throw new AgnesError('Aucune clé API Agnes disponible.', { rateLimited: false });
    }

    ApiKeyManager.recordUsage(keyRow.id);
    const payload = buildCreatePayload(params);
    const url = `${config.agnes.baseUrl}${config.agnes.createPath}`;

    try {
      const { res, bodyText, json } = await httpJson(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keyRow.plainKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 429 || ApiKeyManager.isRateLimitError(res.status, bodyText)) {
        logger.warn(`API key #${keyRow.id} returned ${res.status} (rate limit)`);
        ApiKeyManager.recordError(keyRow.id);
        ApiKeyManager.putInCooldown(keyRow.id, 30);
        lastError = new AgnesError('Limite atteinte sur cette clé.', {
          httpStatus: res.status,
          rateLimited: true
        });
        continue; // essaie la clé suivante
      }

      if (!res.ok) {
        ApiKeyManager.recordError(keyRow.id);
        throw new AgnesError(`Agnes a renvoyé une erreur HTTP ${res.status}`, {
          httpStatus: res.status,
          raw: bodyText
        });
      }

      const videoId = json && (json.video_id || json.id || (json.data && json.data.video_id));
      if (!videoId) {
        ApiKeyManager.recordError(keyRow.id);
        throw new AgnesError('Réponse Agnes invalide : video_id manquant.', { raw: bodyText });
      }

      ApiKeyManager.recordSuccess(keyRow.id);
      logger.info('Tâche Agnes créée', { videoId, apiKeyId: keyRow.id });
      return { videoId, apiKeyId: keyRow.id };
    } catch (err) {
      if (err instanceof AgnesError && err.rateLimited) {
        lastError = err;
        continue;
      }
      if (err instanceof AgnesError) throw err;
      // Erreur réseau / timeout
      ApiKeyManager.recordError(keyRow.id);
      logger.error('Erreur réseau lors de la création de la tâche Agnes', {
        message: err.message
      });
      throw new AgnesError('Erreur réseau lors de la communication avec Agnes.', {
        raw: err.message
      });
    }
  }

  throw lastError || new AgnesError('Impossible de créer la tâche vidéo après plusieurs tentatives.');
}

/**
 * Interroge le statut d'une tâche Agnes. Retourne un objet normalisé :
 * { status: 'queued'|'in_progress'|'completed'|'failed', progress, videoUrl, raw }
 */
async function fetchVideoResult(videoId, apiKeyPlain) {
  const url = `${config.agnes.baseUrl}${config.agnes.resultPath}?video_id=${encodeURIComponent(
    videoId
  )}`;
  const { res, bodyText, json } = await httpJson(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyPlain}` }
  });

  if (res.status === 429) {
    throw new AgnesError('Limite atteinte lors du polling.', {
      httpStatus: 429,
      rateLimited: true
    });
  }
  if (!res.ok) {
    throw new AgnesError(`Erreur HTTP ${res.status} lors du polling Agnes`, {
      httpStatus: res.status,
      raw: bodyText
    });
  }
  if (!json) {
    throw new AgnesError('Réponse Agnes invalide lors du polling.', { raw: bodyText });
  }

  const status = json.status || (json.data && json.data.status) || 'in_progress';
  const progress = json.progress ?? (json.data && json.data.progress) ?? null;
  const metadata = json.metadata || (json.data && json.data.metadata) || {};
  const videoUrl = metadata.url || json.video_url || null;
  const errorMessage = json.error || json.message || null;

  return { status, progress, videoUrl, errorMessage, raw: json };
}

/**
 * Effectue le polling complet d'une tâche jusqu'à completed/failed, avec un intervalle
 * raisonnable entre chaque requête (config.agnes.pollIntervalMs) et un nombre maximum
 * de tentatives (config.agnes.pollMaxAttempts) pour ne jamais boucler indéfiniment.
 *
 * onProgress(status, progress) est appelé à chaque itération pour permettre au bot
 * de mettre à jour le message Telegram de progression.
 */
async function pollUntilDone(videoId, apiKeyRow, onProgress) {
  for (let i = 0; i < config.agnes.pollMaxAttempts; i++) {
    let result;
    try {
      result = await fetchVideoResult(videoId, apiKeyRow.plainKey);
    } catch (err) {
      if (err instanceof AgnesError && err.rateLimited) {
        // La clé utilisée pour la création a atteint sa limite pendant le polling :
        // on la met en cooldown et on continue d'essayer avec la même vidéo un peu plus tard
        // (le polling n'a pas besoin de clé différente, Agnes suit la tâche par video_id,
        // mais on protège quand même la clé pour les prochaines créations).
        ApiKeyManager.putInCooldown(apiKeyRow.id, 30);
        await sleep(config.agnes.pollIntervalMs);
        continue;
      }
      throw err;
    }

    if (typeof onProgress === 'function') {
      onProgress(result.status, result.progress);
    }

    if (result.status === 'completed') {
      if (!result.videoUrl) {
        throw new AgnesError('Vidéo marquée complétée mais URL introuvable (metadata.url).');
      }
      return result;
    }
    if (result.status === 'failed') {
      throw new AgnesError(result.errorMessage || 'La génération Agnes a échoué.', {
        raw: result.raw
      });
    }

    await sleep(config.agnes.pollIntervalMs);
  }

  throw new AgnesError('Délai de génération dépassé (timeout du polling).');
}

module.exports = {
  AgnesError,
  createVideoJob,
  pollUntilDone
};

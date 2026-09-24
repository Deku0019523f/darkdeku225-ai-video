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
 * Cherche l'URL de la vidéo dans la réponse Agnes, quelle que soit sa forme :
 * - Video V2.0 : metadata.url
 * - Video 2.5 / 2.5 Flash : url au premier niveau
 * - autres variantes (video_url, data.url, output.url...) puis recherche générique
 *   d'une URL de fichier vidéo dans tout l'objet.
 */
function extractVideoUrl(json) {
  if (!json || typeof json !== 'object') return null;
  const candidates = [
    json.metadata && json.metadata.url,
    json.url,
    json.video_url,
    json.data && json.data.url,
    json.data && json.data.video_url,
    json.data && json.data.metadata && json.data.metadata.url,
    json.output && json.output.url,
    json.result && json.result.url
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  // Recherche générique d'une URL de fichier vidéo n'importe où dans la réponse
  const videoRe = /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i;
  const stack = [json];
  while (stack.length) {
    const cur = stack.pop();
    if (typeof cur === 'string') {
      if (videoRe.test(cur)) return cur;
    } else if (Array.isArray(cur)) {
      stack.push(...cur);
    } else if (cur && typeof cur === 'object') {
      stack.push(...Object.values(cur));
    }
  }
  return null;
}

function errorToString(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') return err.message || JSON.stringify(err);
  return String(err);
}

/**
 * Interroge le statut d'une tâche Agnes. Retourne un objet normalisé :
 * { status: 'queued'|'in_progress'|'completed'|'failed', progress, videoUrl, raw }
 */
async function fetchVideoResult(videoId, apiKeyPlain) {
  const url =
    `${config.agnes.baseUrl}${config.agnes.resultPath}` +
    `?video_id=${encodeURIComponent(videoId)}` +
    `&model_name=${encodeURIComponent(config.agnes.model)}`;
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
  const videoUrl = extractVideoUrl(json);
  const errorMessage = errorToString(json.error) || errorToString(json.message);

  return { status, progress, videoUrl, errorMessage, raw: json, bodyText };
}

/**
 * Méthode "legacy" de récupération : GET /v1/videos/<task_id>.
 * Utilisée en secours si la tâche est complétée mais que l'URL n'apparaît pas.
 */
async function fetchLegacyResult(taskId, apiKeyPlain) {
  const url = `${config.agnes.baseUrl}${config.agnes.createPath}/${encodeURIComponent(taskId)}`;
  const { res, json } = await httpJson(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyPlain}` }
  });
  if (!res.ok || !json) return null;
  return extractVideoUrl(json);
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
  let rateLimitHits = 0;

  for (let i = 0; i < config.agnes.pollMaxAttempts; i++) {
    let result;
    try {
      result = await fetchVideoResult(videoId, apiKeyRow.plainKey);
    } catch (err) {
      if (err instanceof AgnesError && err.rateLimited) {
        // 429 pendant le polling : on ralentit (backoff progressif) SANS mettre la clé
        // en cooldown, sinon une simple vidéo en cours bloquerait la clé 30 minutes.
        rateLimitHits += 1;
        logger.warn('Limite atteinte pendant le polling, ralentissement', {
          apiKeyId: apiKeyRow.id,
          hits: rateLimitHits
        });
        await sleep(Math.min(config.agnes.pollIntervalMs * (1 + rateLimitHits), 30000));
        continue;
      }
      throw err;
    }

    if (typeof onProgress === 'function') {
      onProgress(result.status, result.progress);
    }

    if (result.status === 'completed') {
      let videoUrl = result.videoUrl;

      if (!videoUrl) {
        // Complétée mais sans URL : on journalise la réponse brute (sans secret) pour
        // diagnostiquer, puis on tente la méthode legacy et quelques relectures, car
        // l'URL peut apparaître un court instant après le passage à "completed".
        logger.warn('Vidéo complétée sans URL, tentative de récupération', {
          videoId,
          response: (result.bodyText || '').slice(0, 1500)
        });
        const taskId = result.raw && (result.raw.task_id || result.raw.id);
        for (let retry = 0; retry < 5 && !videoUrl; retry++) {
          await sleep(3000);
          try {
            if (taskId) videoUrl = await fetchLegacyResult(taskId, apiKeyRow.plainKey);
            if (!videoUrl) {
              const again = await fetchVideoResult(videoId, apiKeyRow.plainKey);
              videoUrl = again.videoUrl;
            }
          } catch (_) {
            // on réessaie au tour suivant
          }
        }
      }

      if (!videoUrl) {
        throw new AgnesError('Vidéo marquée complétée mais URL introuvable.', {
          raw: result.raw
        });
      }
      return { ...result, videoUrl };
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

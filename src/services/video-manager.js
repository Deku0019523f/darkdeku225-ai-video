const db = require('../database');
const config = require('../config');
const agnes = require('./agnes');
const ApiKeyManager = require('./api-manager');
const logger = require('../utils/logger');
const { framesForSeconds } = require('../utils/helpers');

const VideoManager = {
  createJob({ telegramUserId, prompt, style, format, durationSeconds, width, height }) {
    const numFrames = framesForSeconds(durationSeconds);
    const stmt = db.prepare(
      `INSERT INTO video_jobs
        (telegram_user_id, prompt, style, format, duration, width, height, num_frames, frame_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    );
    const info = stmt.run(
      telegramUserId,
      prompt,
      style,
      format,
      durationSeconds,
      width,
      height,
      numFrames,
      config.frameRate
    );
    return this.getJob(info.lastInsertRowid);
  },

  getJob(id) {
    return db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(id);
  },

  updateJob(id, fields) {
    const current = this.getJob(id);
    if (!current) return null;
    const merged = { ...current, ...fields };
    db.prepare(
      `UPDATE video_jobs SET
        api_key_id = ?, agnes_video_id = ?, agnes_task_id = ?, status = ?,
        video_url = ?, error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(
      merged.api_key_id,
      merged.agnes_video_id,
      merged.agnes_task_id,
      merged.status,
      merged.video_url,
      merged.error_message,
      merged.completed_at,
      id
    );
    return this.getJob(id);
  },

  /**
   * Orchestration complète : crée la tâche chez Agnes, met à jour le job, puis fait
   * le polling jusqu'à complétion. onProgress(status, progress) permet au handler
   * Telegram de mettre à jour le message envoyé à l'utilisateur.
   */
  async runJob(jobId, { imageBase64OrUrl, onProgress } = {}) {
    const job = this.getJob(jobId);
    if (!job) throw new Error('Tâche vidéo introuvable.');

    const { videoId, apiKeyId } = await agnes.createVideoJob({
      prompt: job.prompt,
      imageBase64OrUrl,
      width: job.width,
      height: job.height,
      num_frames: job.num_frames,
      frame_rate: job.frame_rate
    });

    this.updateJob(jobId, {
      api_key_id: apiKeyId,
      agnes_video_id: videoId,
      agnes_task_id: videoId,
      status: 'queued'
    });

    const keyRow = ApiKeyManager.getById(apiKeyId);
    const { decrypt } = require('../utils/helpers');
    const apiKeyRow = { id: apiKeyId, plainKey: decrypt(keyRow.encrypted_key) };

    try {
      const result = await agnes.pollUntilDone(videoId, apiKeyRow, (status, progress) => {
        this.updateJob(jobId, { status });
        if (typeof onProgress === 'function') onProgress(status, progress);
      });

      this.updateJob(jobId, {
        status: 'completed',
        video_url: result.videoUrl,
        completed_at: new Date().toISOString()
      });
      ApiKeyManager.recordSuccess(apiKeyId);
      return result.videoUrl;
    } catch (err) {
      logger.error('Échec de la tâche vidéo Agnes', { jobId, message: err.message });
      ApiKeyManager.recordError(apiKeyId);
      this.updateJob(jobId, {
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString()
      });
      throw err;
    }
  },

  // --- Statistiques pour le panel admin ---
  getStats() {
    const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    const newToday = db
      .prepare(`SELECT COUNT(*) c FROM users WHERE date(created_at) = date('now')`)
      .get().c;
    const activeToday = db
      .prepare(`SELECT COUNT(*) c FROM users WHERE date(last_seen_at) = date('now')`)
      .get().c;
    const activeWeek = db
      .prepare(`SELECT COUNT(*) c FROM users WHERE last_seen_at >= datetime('now', '-7 days')`)
      .get().c;
    const activeMonth = db
      .prepare(`SELECT COUNT(*) c FROM users WHERE last_seen_at >= datetime('now', '-30 days')`)
      .get().c;

    const totalVideos = db.prepare('SELECT COUNT(*) c FROM video_jobs').get().c;
    const videosToday = db
      .prepare(`SELECT COUNT(*) c FROM video_jobs WHERE date(created_at) = date('now')`)
      .get().c;
    const videosWeek = db
      .prepare(`SELECT COUNT(*) c FROM video_jobs WHERE created_at >= datetime('now', '-7 days')`)
      .get().c;
    const videosMonth = db
      .prepare(`SELECT COUNT(*) c FROM video_jobs WHERE created_at >= datetime('now', '-30 days')`)
      .get().c;

    const successCount = db
      .prepare(`SELECT COUNT(*) c FROM video_jobs WHERE status = 'completed'`)
      .get().c;
    const failedCount = db
      .prepare(`SELECT COUNT(*) c FROM video_jobs WHERE status = 'failed'`)
      .get().c;
    const pendingCount = db
      .prepare(
        `SELECT COUNT(*) c FROM video_jobs WHERE status IN ('pending','queued','in_progress')`
      )
      .get().c;

    return {
      users: {
        total: totalUsers,
        newToday,
        activeToday,
        activeWeek,
        activeMonth
      },
      videos: {
        total: totalVideos,
        today: videosToday,
        week: videosWeek,
        month: videosMonth,
        success: successCount,
        failed: failedCount,
        pending: pendingCount
      }
    };
  }
};

module.exports = VideoManager;

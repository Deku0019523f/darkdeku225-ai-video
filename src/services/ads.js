const db = require('../database');

const AdsService = {
  add({ image, message, buttonText, url }) {
    const stmt = db.prepare(
      `INSERT INTO ads (image, message, button_text, url, active) VALUES (?, ?, ?, ?, 1)`
    );
    const info = stmt.run(image || null, message, buttonText || null, url || null);
    return this.getById(info.lastInsertRowid);
  },

  getById(id) {
    return db.prepare('SELECT * FROM ads WHERE id = ?').get(id);
  },

  listAll() {
    return db.prepare('SELECT * FROM ads ORDER BY id DESC').all();
  },

  update(id, fields) {
    const current = this.getById(id);
    if (!current) return null;
    const merged = { ...current, ...fields };
    db.prepare(
      `UPDATE ads SET image = ?, message = ?, button_text = ?, url = ?, active = ? WHERE id = ?`
    ).run(merged.image, merged.message, merged.button_text, merged.url, merged.active, id);
    return this.getById(id);
  },

  setActive(id, active) {
    db.prepare('UPDATE ads SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  },

  remove(id) {
    db.prepare('DELETE FROM ads WHERE id = ?').run(id);
  },

  /**
   * Choisit une publicité active à afficher (round-robin simple par compteur d'affichage),
   * ou null s'il n'y a aucune publicité active. La fréquence d'affichage (toutes les N
   * générations) est gérée par l'appelant via le réglage "ads_frequency" (table settings).
   */
  pickOneToShow() {
    const ad = db
      .prepare('SELECT * FROM ads WHERE active = 1 ORDER BY display_count ASC, id ASC LIMIT 1')
      .get();
    if (!ad) return null;
    db.prepare('UPDATE ads SET display_count = display_count + 1 WHERE id = ?').run(ad.id);
    return ad;
  },

  getAdsFrequency() {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'ads_frequency'`).get();
    return row ? parseInt(row.value, 10) || 3 : 3;
  },

  setAdsFrequency(n) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('ads_frequency', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(String(n));
  }
};

module.exports = AdsService;

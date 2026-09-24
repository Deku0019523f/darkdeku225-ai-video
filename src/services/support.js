const db = require('../database');

const SupportService = {
  getInfoText() {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'support_info'`).get();
    if (!row) return "Besoin d'aide ou envie de découvrir mes autres projets ?";
    try {
      return JSON.parse(row.value).text;
    } catch (_) {
      return "Besoin d'aide ou envie de découvrir mes autres projets ?";
    }
  },

  setInfoText(text) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('support_info', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(JSON.stringify({ text }));
  },

  listSites({ onlyActive = false } = {}) {
    const query = onlyActive
      ? 'SELECT * FROM support_sites WHERE active = 1 ORDER BY position ASC, id ASC'
      : 'SELECT * FROM support_sites ORDER BY position ASC, id ASC';
    return db.prepare(query).all();
  },

  getSite(id) {
    return db.prepare('SELECT * FROM support_sites WHERE id = ?').get(id);
  },

  addSite({ name, description, url, buttonText, position }) {
    const stmt = db.prepare(
      `INSERT INTO support_sites (name, description, url, button_text, position, active)
       VALUES (?, ?, ?, ?, ?, 1)`
    );
    const info = stmt.run(
      name,
      description || null,
      url,
      buttonText || name,
      position || 0
    );
    return this.getSite(info.lastInsertRowid);
  },

  updateSite(id, fields) {
    const current = this.getSite(id);
    if (!current) return null;
    const merged = { ...current, ...fields };
    db.prepare(
      `UPDATE support_sites
       SET name = ?, description = ?, url = ?, button_text = ?, position = ?, active = ?
       WHERE id = ?`
    ).run(
      merged.name,
      merged.description,
      merged.url,
      merged.button_text,
      merged.position,
      merged.active,
      id
    );
    return this.getSite(id);
  },

  removeSite(id) {
    db.prepare('DELETE FROM support_sites WHERE id = ?').run(id);
  }
};

module.exports = SupportService;

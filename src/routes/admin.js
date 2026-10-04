const express = require('express');
const ApiKeyManager = require('../services/api-manager');
const VideoManager = require('../services/video-manager');
const AdsService = require('../services/ads');
const SupportService = require('../services/support');

// Ne jamais exposer la clé chiffrée ou en clair au frontend : uniquement les champs sûrs.
function sanitizeKey(k) {
  return {
    id: k.id,
    masked_key: k.masked_key,
    status: k.status,
    usage_count: k.usage_count,
    success_count: k.success_count,
    error_count: k.error_count,
    rate_limit_count: k.rate_limit_count,
    last_used_at: k.last_used_at,
    disabled_until: k.disabled_until,
    created_at: k.created_at
  };
}

module.exports = function adminRoutes() {
  const router = express.Router();

  // --- Statistiques ---
  router.get('/stats', (req, res) => {
    res.json({
      videoStats: VideoManager.getStats(),
      apiStats: ApiKeyManager.getStats()
    });
  });

  // --- Clés API ---
  router.get('/keys', (req, res) => {
    res.json(ApiKeyManager.listAll().map(sanitizeKey));
  });

  router.post('/keys', (req, res) => {
    try {
      const key = ApiKeyManager.addKey((req.body || {}).key);
      res.status(201).json(sanitizeKey(key));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/keys/:id', (req, res) => {
    const ok = ApiKeyManager.removeKey(parseInt(req.params.id, 10));
    if (!ok) return res.status(404).json({ error: 'Clé introuvable.' });
    res.json({ success: true });
  });

  // --- Publicités ---
  router.get('/ads', (req, res) => {
    res.json(AdsService.listAll());
  });

  router.post('/ads', (req, res) => {
    const { image, message, buttonText, url } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message requis.' });
    }
    const ad = AdsService.add({ image, message: message.trim(), buttonText, url });
    res.status(201).json(ad);
  });

  router.patch('/ads/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { active, message, buttonText, url, image } = req.body || {};
    let ad = AdsService.getById(id);
    if (!ad) return res.status(404).json({ error: 'Publicité introuvable.' });
    if (typeof active === 'boolean') AdsService.setActive(id, active);
    if (message || buttonText !== undefined || url !== undefined || image !== undefined) {
      ad = AdsService.update(id, {
        message: message ?? ad.message,
        button_text: buttonText !== undefined ? buttonText : ad.button_text,
        url: url !== undefined ? url : ad.url,
        image: image !== undefined ? image : ad.image
      });
    }
    res.json(AdsService.getById(id));
  });

  router.delete('/ads/:id', (req, res) => {
    AdsService.remove(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  // --- Soutien ---
  router.get('/support', (req, res) => {
    res.json({ info: SupportService.getInfoText(), sites: SupportService.listSites() });
  });

  router.put('/support/info', (req, res) => {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte requis.' });
    SupportService.setInfoText(text.trim());
    res.json({ success: true });
  });

  router.post('/support/sites', (req, res) => {
    const { name, description, url, buttonText, position } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: 'Nom et URL requis.' });
    const site = SupportService.addSite({ name, description, url, buttonText, position });
    res.status(201).json(site);
  });

  router.patch('/support/sites/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const site = SupportService.getSite(id);
    if (!site) return res.status(404).json({ error: 'Site introuvable.' });
    const { name, description, url, buttonText, position, active } = req.body || {};
    const updated = SupportService.updateSite(id, {
      name: name ?? site.name,
      description: description !== undefined ? description : site.description,
      url: url ?? site.url,
      button_text: buttonText !== undefined ? buttonText : site.button_text,
      position: position !== undefined ? position : site.position,
      active: typeof active === 'boolean' ? (active ? 1 : 0) : site.active
    });
    res.json(updated);
  });

  router.delete('/support/sites/:id', (req, res) => {
    SupportService.removeSite(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  return router;
};

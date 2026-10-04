const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { requireTelegramAuth, requireAdmin } = require('./webapp-auth');

function startServer(bot) {
  const app = express();

  app.use(express.json({ limit: '15mb' })); // les images en base64 peuvent être volumineuses
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const commonRoutes = require('./routes/common')(bot);
  const videoRoutes = require('./routes/video')(bot);
  const adminRoutes = require('./routes/admin')();

  app.use('/api', requireTelegramAuth, commonRoutes);
  app.use('/api/video', requireTelegramAuth, videoRoutes);
  app.use('/api/admin', requireTelegramAuth, requireAdmin, adminRoutes);

  // Toute route non-API sert la Mini App (SPA côté client)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    logger.error('Erreur serveur HTTP non gérée', { message: err.message });
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  app.listen(config.webapp.port, () => {
    logger.info('Serveur Mini App démarré', {
      port: config.webapp.port,
      webappUrl: config.webapp.url
    });
  });

  return app;
}

module.exports = startServer;

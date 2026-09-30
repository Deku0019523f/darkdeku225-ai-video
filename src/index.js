require('./database'); // initialise le schéma SQLite au démarrage
const bot = require('./bot');
const startServer = require('./server');

startServer(bot);

process.on('unhandledRejection', (reason) => {
  require('./utils/logger').error('Promesse rejetée non gérée', {
    message: reason?.message || String(reason)
  });
});
process.on('uncaughtException', (err) => {
  require('./utils/logger').error('Exception non capturée', { message: err.message });
});

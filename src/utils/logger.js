const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_) {
  // Si le dossier ne peut pas être créé (ex: FS en lecture seule), on logue en console uniquement.
}

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(line) {
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'bot.log'), line + '\n');
  } catch (_) {
    // silencieux : ne doit jamais crasher le bot pour un problème de log
  }
}

function format(level, message, meta) {
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  return `[${timestamp()}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info(message, meta) {
    const line = format('INFO', message, meta);
    console.log(line);
    writeToFile(line);
  },
  warn(message, meta) {
    const line = format('WARN', message, meta);
    console.warn(line);
    writeToFile(line);
  },
  error(message, meta) {
    const line = format('ERROR', message, meta);
    console.error(line);
    writeToFile(line);
  }
};

module.exports = logger;

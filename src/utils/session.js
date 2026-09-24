/**
 * Sessions de workflow en mémoire, isolées par telegram_user_id, pour éviter toute
 * variable globale partagée entre conversations. Convient à un bot mono-process (PM2 fork).
 */
const sessions = new Map();

function getSession(telegramUserId) {
  if (!sessions.has(telegramUserId)) {
    sessions.set(telegramUserId, { state: 'IDLE', data: {} });
  }
  return sessions.get(telegramUserId);
}

function setState(telegramUserId, state, dataPatch = {}) {
  const session = getSession(telegramUserId);
  session.state = state;
  session.data = { ...session.data, ...dataPatch };
  sessions.set(telegramUserId, session);
  return session;
}

function resetSession(telegramUserId) {
  sessions.set(telegramUserId, { state: 'IDLE', data: {} });
}

module.exports = { getSession, setState, resetSession };

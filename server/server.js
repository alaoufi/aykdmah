// AYK-251: one copy of the server per CPU core. A single copy uses one core however many the
// machine has (about 440 requests a second in the simulator); APP_WORKERS=N starts N copies that
// share the port, and their live connections talk to each other through the cluster adapter.
// APP_WORKERS unset or 1 = exactly the earlier single process.
const cluster = require('cluster');
const WORKERS = Math.max(1, Math.min(32, Number(process.env.APP_WORKERS) || 1));
if (WORKERS > 1 && cluster.isPrimary) {
  require('./cluster').startPrimary(WORKERS);
  return;
}
// Timers that must run once for the whole site (reminders, the stale-call sweep), not once per copy.
const BACKGROUND = !cluster.isWorker || process.env.APP_WORKER_INDEX === '0';

const http = require('http');
const env = require('./config/env');
const app = require('./app');
const initSocket = require('./socket');
const notificationService = require('./services/notificationService');
const logger = require('./utils/logger');

const httpServer = http.createServer(app);
const io = initSocket(httpServer);

app.set('io', io);
notificationService.setIo(io);
require('./services/callService').attach(io, { background: BACKGROUND });
if (BACKGROUND) require('./services/requestReminderService').start();

const PORT = env.APP_PORT;
// AYK-325: «متواجد الآن» follows the live connection. A restart drops every connection without
// its goodbye, so marks older than a minute are cleared; apps reconnect and mark themselves again.
if (BACKGROUND) {
  require('./config/database').query("UPDATE users SET is_online = 0 WHERE is_online = 1 AND (last_seen_at IS NULL OR last_seen_at < CURRENT_TIMESTAMP - INTERVAL '1 minute')")
    .catch(err => logger.warn('Presence reset failed:', err.message));
}
httpServer.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT} (${env.NODE_ENV})${cluster.isWorker ? `, copy ${process.env.APP_WORKER_INDEX}` : ''}`);
  logger.info('Database setup and migrations use npm run seed.');
});

process.on('unhandledRejection', (err) => {
  logger.error('UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  logger.error('UncaughtException:', err);
  process.exit(1);
});

const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

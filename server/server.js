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
require('./services/callService').attach(io);

const PORT = env.APP_PORT;
httpServer.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT} (${env.NODE_ENV})`);
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

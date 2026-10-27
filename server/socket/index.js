const { Server } = require('socket.io');
const socketAuth = require('./auth');
const registerChat = require('./chatHandler');
const registerNotifications = require('./notificationHandler');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../utils/logger');
const Conversation = require('../models/Conversation');
const { emitUser } = require('../utils/conversationEvents');

async function emitPresence(io, userId, isOnline) {
  for (const contact of await Conversation.getContacts(userId)) {
    await emitUser(io, contact.id, 'user:online', { userId, isOnline });
  }
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL || '*', credentials: true },
    pingTimeout: 30000,
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: user=${user.id}`);

    socket.data.authToken = socket.authToken;
    socket.use(async (packet, next) => {
      try { socket.user = await socketAuth.validateToken(socket.authToken); next(); }
      catch (_) {
        const ack = packet[packet.length - 1];
        if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' });
        socket.disconnect(true);
        next(new Error('Unauthorized'));
      }
    });
    const refresh = setInterval(async () => {
      try { socket.user = await socketAuth.validateToken(socket.authToken); }
      catch (_) { socket.disconnect(true); }
    }, 30000);
    refresh.unref();

    socket.join(`user:${user.id}`);
    registerChat(io, socket);
    registerNotifications(io, socket);

    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: user=${user.id}`);
      clearInterval(refresh);
      try {
        if (!(await io.in(`user:${user.id}`).fetchSockets()).length) {
          await User.setOnline(user.id, false);
          await emitPresence(io, user.id, false);
        }
      } catch (_) { /* ignore */ }
    });
    try {
      await User.setOnline(user.id, true);
      await emitPresence(io, user.id, true);
    } catch (_) { /* Presence errors do not interrupt authenticated handlers. */ }
  });

  return io;
}

module.exports = initSocket;

const { Server } = require('socket.io');
const socketAuth = require('./auth');
const registerChat = require('./chatHandler');
const registerNotifications = require('./notificationHandler');
const User = require('../models/User');
const env = require('../config/env');
const logger = require('../utils/logger');
const Conversation = require('../models/Conversation');
const { emitUser } = require('../utils/conversationEvents');

// AYK-254: "online / offline" goes to each contact's own room in one step. It used to look up
// every contact's connections and re-check each session, one contact after another: a provider
// with 300 chats cost 300 look-ups on every connect and disconnect. The notice holds only an id
// and a flag, and a room only ever contains that account's own authenticated connections.
async function emitPresence(io, userId, isOnline) {
  const contacts = await Conversation.getContacts(userId);
  // AYK-478: with the moment, so the other side shows «آخر ظهور» at once when this account leaves.
  const lastSeenAt = new Date().toISOString();
  for (const contact of contacts) io.to(`user:${contact.id}`).emit('user:online', { userId, isOnline, lastSeenAt });
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    // AYK-275: with several server copies (APP_WORKERS > 1) a live connection must stay on one copy.
    // A WebSocket does; the long-polling fallback sends each request to any copy and would fail.
    // So clustered, only WebSocket is offered: a phone that cannot open one keeps working through
    // the app's own refresh every few seconds (NotificationContext / useLiveRefresh), as offline.
    ...(Number(process.env.APP_WORKERS) > 1 ? { transports: ['websocket'] } : {}),
    // AYK-240: the same origins as the API (never "*"); native apps send no Origin header.
    cors: { origin: [env.CLIENT_URL, env.APP_URL, ...env.SITE_ORIGINS].filter(Boolean), credentials: true },
    pingTimeout: 30000,
    maxHttpBufferSize: 64 * 1024,
  });
  // Several server copies (AYK-251): a message sent from one copy reaches people connected to
  // another, and room queries cover all of them.
  if (require('cluster').isWorker) io.adapter(require('@socket.io/cluster-adapter').createAdapter());

  // AYK-243: connection floods are refused before authentication work, then per account.
  const floodGuard = require('./floodGuard');
  io.use(floodGuard.connectionRate);
  io.use(socketAuth);
  io.use(floodGuard.userLimit);

  io.on('connection', async (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: user=${user.id}`);

    socket.data.authToken = socket.authToken;
    // AYK-253: at most 40 events in any 10 seconds per connection (typing, reading, joining...).
    // More than that is not a person; the extra ones are dropped before they reach the database.
    let bucket = { start: Date.now(), count: 0 };
    socket.use((packet, next) => {
      const now = Date.now();
      if (now - bucket.start >= 10000) bucket = { start: now, count: 0 };
      if (++bucket.count <= 40) return next();
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack({ ok: false, error: 'rate_limited' });
      return undefined; // dropped
    });
    socket.use(async (packet, next) => {
      try { socket.user = await socketAuth.validateToken(socket.authToken, socket.handshake.auth?.scope); next(); }
      catch (_) {
        const ack = packet[packet.length - 1];
        if (typeof ack === 'function') ack({ ok: false, error: 'unauthorized' });
        socket.disconnect(true);
        next(new Error('Unauthorized'));
      }
    });
    const refresh = setInterval(async () => {
      try { socket.user = await socketAuth.validateToken(socket.authToken); }
      catch (_) { socket.disconnect(true); return; }
      // AYK-480 (the owner: «آخر ظهور يعبّر عن آخر لحظة كان متصلًا»): while the connection is open its time
      // keeps moving, so a connection that ends without a goodbye (a restart, a dropped network) leaves
      // «the last moment connected», not the moment it was opened. The administration's own area is not counted.
      if (socket.handshake.auth?.scope !== 'admin') User.touchSeen(user.id).catch(() => {});
    }, 30000);
    refresh.unref();

    socket.join(`user:${user.id}`);
    // With several server copies each one counts only its own connections, so the per-account
    // limit is checked again across all of them (AYK-251).
    if (require('cluster').isWorker) {
      io.in(`user:${user.id}`).fetchSockets().then(all => {
        if (all.length > floodGuard.SOCKETS_PER_USER) socket.disconnect(true);
      }).catch(() => {});
    }
    // On screen or in the background (AYK-125); unknown (an older app) counts as background.
    socket.data.visible = false;
    socket.on('app:visible', visible => { socket.data.visible = visible === true; });
    // The reader's language (AYK-231): a new message is translated into it as soon as it is sent.
    const LANGS = ['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];
    const setLang = lang => { if (LANGS.includes(lang)) socket.data.lang = lang; };
    setLang(socket.handshake.auth?.lang);
    socket.on('app:lang', setLang);
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
    // Their app is open: every message waiting for them has now reached their phone (AYK-122).
    require('../models/Message').markDelivered(io, user.id).catch(err => logger.warn('Delivered mark failed:', err.message));
  });

  return io;
}

module.exports = initSocket;

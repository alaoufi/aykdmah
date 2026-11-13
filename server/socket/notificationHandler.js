function registerNotificationHandlers(io, socket) {
  socket.on('notifications:subscribe', (ack) => {
    socket.join(`user:${socket.user.id}`);
    typeof ack === 'function' && ack({ ok: true });
  });
}

module.exports = registerNotificationHandlers;

const Conversation = require('../models/Conversation');
const socketAuth = require('../socket/auth');

async function emitUser(io, userId, event, payload, { excludeSocketId } = {}) {
  if (!io) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    if (socket.id === excludeSocketId) continue;
    try {
      const user = await socketAuth.validateToken(socket.authToken || socket.data?.authToken);
      if (Number(user.id) !== Number(userId)) { socket.disconnect(true); continue; }
      io.to(socket.id).emit(event, payload);
    } catch (_) { socket.disconnect(true); }
  }
}

// Do not broadcast private data to cached conversation-room memberships.
// Participants are resolved for each emission, after any removal/reassignment.
async function emitConversation(io, conversationId, event, payload, { excludeSocketId } = {}) {
  if (!io) return;
  const participants = await Conversation.getParticipants(conversationId);
  for (const participant of participants) {
    await emitUser(io, participant.id, event, payload, { excludeSocketId });
  }
}

module.exports = { emitConversation, emitUser };

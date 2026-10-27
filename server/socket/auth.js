const { verify } = require('../utils/jwt');
const { loadSessionUser } = require('../middleware/auth');

async function validateToken(token) {
  const payload = verify(token);
  const user = await loadSessionUser(payload);
  if (!user || !user.is_active || user.is_blocked) throw new Error('Invalid session');
  return user;
}

async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) return next(new Error('Missing token'));

    let user;
    try {
      user = await validateToken(token);
    } catch (_) {
      return next(new Error('Invalid token'));
    }

    socket.user = user;
    socket.authToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = socketAuth;
module.exports.validateToken = validateToken;

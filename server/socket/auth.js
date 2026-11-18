const { verify } = require('../utils/jwt');
const { loadSessionUser } = require('../middleware/auth');

// scope: the area the connection comes from ("admin" or "site"), for tokens from before areas.
// AYK-252: a live connection's session was read from the database on every incoming packet
// (typing included), every outgoing event and every 30 seconds per connection: with tens of
// thousands connected that is thousands of queries a second doing nothing. One check per session
// is now good for 15 seconds, shared by all of that session's uses; signing out or changing the
// password closes the connections at once as before, and a blocked account stops within 15 seconds.
const CHECK_MS = process.env.NODE_ENV === 'test' ? 0 : 15000;
const checked = new Map(); // token|scope -> { at, user } | { pending }
const CHECKED_MAX = 100000;

async function loadUser(token, scope) {
  const payload = verify(token);
  const user = await loadSessionUser(payload, scope);
  if (!user || !user.is_active || user.is_blocked) throw new Error('Invalid session');
  return user;
}

async function validateToken(token, scope = 'site') {
  if (!CHECK_MS || typeof token !== 'string') return loadUser(token, scope);
  const key = `${scope}|${token}`;
  const known = checked.get(key);
  if (known?.user && Date.now() - known.at < CHECK_MS) { verify(token); return known.user; } // still refuses an expired token
  if (known?.pending) return known.pending;
  if (checked.size >= CHECKED_MAX) checked.clear();
  const pending = loadUser(token, scope).then(
    user => { checked.set(key, { at: Date.now(), user }); return user; },
    err => { checked.delete(key); throw err; });
  checked.set(key, { pending });
  return pending;
}
// Sessions older than the window are dropped every minute so the map follows who is connected.
setInterval(() => { const now = Date.now(); for (const [key, v] of checked) if (!v.pending && now - v.at > CHECK_MS) checked.delete(key); }, 60000).unref();

async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) return next(new Error('Missing token'));

    let user;
    try {
      user = await validateToken(token, socket.handshake.auth?.scope);
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

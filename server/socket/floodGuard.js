// Socket flood guard (AYK-243). Before authentication: at most CONNECT_PER_MINUTE (300) new connections a
// minute from one address. After authentication: at most SOCKETS_PER_USER live connections for one
// account (tabs, phone and app together stay far below it). Refusals are counted, and the first
// refusal of each address and minute is recorded for the admin security report.
const CONNECT_PER_MINUTE = Number(process.env.SOCKET_CONNECT_PER_MINUTE) || 300; // generous: carriers share addresses
const SOCKETS_PER_USER = Number(process.env.SOCKETS_PER_USER) || 12;

const windows = new Map(); // address -> { start, count, logged }
const perUser = new Map(); // user id -> live sockets

// The client address as the server's last trusted proxy saw it (same rule as Express, trust proxy 1).
function clientAddress(socket) {
  const forwarded = String(socket.handshake.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return (process.env.TRUST_PROXY === '1' && forwarded.length ? forwarded[forwarded.length - 1] : socket.handshake.address) || 'unknown';
}

function record(socket, address, detail) {
  const req = { ip: address, headers: socket.handshake.headers };
  require('../utils/securityLog').logSecurityEvent(req, 'rate_limited', { description: detail }).catch(() => {});
}

function connectionRate(socket, next) {
  const address = clientAddress(socket);
  const now = Date.now();
  let w = windows.get(address);
  if (!w || now - w.start >= 60000) { w = { start: now, count: 0, logged: false }; windows.set(address, w); }
  w.count += 1;
  if (w.count > CONNECT_PER_MINUTE) {
    if (!w.logged) { w.logged = true; record(socket, address, 'socket-connect'); }
    const err = new Error('rate_limited');
    err.data = { retry_after: Math.ceil((60000 - (now - w.start)) / 1000) };
    return next(err);
  }
  return next();
}

function userLimit(socket, next) {
  const id = socket.user?.id;
  if (!id) return next();
  const live = perUser.get(id) || 0;
  if (live >= SOCKETS_PER_USER) {
    record(socket, clientAddress(socket), 'socket-per-user');
    return next(new Error('too_many_connections'));
  }
  perUser.set(id, live + 1);
  socket.once('disconnect', () => {
    const left = (perUser.get(id) || 1) - 1;
    if (left > 0) perUser.set(id, left); else perUser.delete(id);
  });
  return next();
}

// Old windows are dropped every minute so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) if (now - w.start >= 60000) windows.delete(key);
}, 60000).unref();

module.exports = { connectionRate, userLimit, clientAddress, CONNECT_PER_MINUTE, SOCKETS_PER_USER };

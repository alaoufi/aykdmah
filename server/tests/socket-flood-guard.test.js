// AYK-243: socket connection floods are refused per address and per account. No database needed:
// the address limit runs before authentication, and the account limit is exercised directly.
process.env.SOCKET_CONNECT_PER_MINUTE = '5';
process.env.SOCKETS_PER_USER = '2';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');

test('the 6th connection a minute from one address is refused before authentication', async () => {
  const { Server } = require('socket.io');
  const guard = require('../socket/floodGuard');
  const server = http.createServer();
  const io = new Server(server);
  io.use(guard.connectionRate);
  io.use((socket, next) => next(new Error('Missing token'))); // stands in for authentication
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { io: connect } = require('../../client/node_modules/socket.io-client');
  const errors = [];
  for (let i = 0; i < 7; i += 1) {
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false });
    errors.push(await new Promise(resolve => socket.once('connect_error', e => { socket.close(); resolve(e.message); })));
  }
  io.close(); server.close();
  assert.deepEqual(errors, ['Missing token', 'Missing token', 'Missing token', 'Missing token', 'Missing token', 'rate_limited', 'rate_limited']);
});

test('one account keeps at most SOCKETS_PER_USER live connections; a closed one frees its place', () => {
  const guard = require('../socket/floodGuard');
  const fake = () => Object.assign(new EventEmitter(), { user: { id: 77 }, handshake: { headers: {}, address: '127.0.0.1' } });
  const results = [];
  const sockets = [fake(), fake(), fake()];
  for (const s of sockets) guard.userLimit(s, err => results.push(err ? err.message : 'ok'));
  assert.deepEqual(results, ['ok', 'ok', 'too_many_connections']);
  sockets[0].emit('disconnect');
  guard.userLimit(fake(), err => results.push(err ? err.message : 'ok'));
  assert.equal(results[3], 'ok');
});

test('the client address comes from the last trusted proxy hop only', () => {
  const guard = require('../socket/floodGuard');
  process.env.TRUST_PROXY = '1';
  const socket = { handshake: { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, address: '172.18.0.5' } };
  assert.equal(guard.clientAddress(socket), '203.0.113.9');
  process.env.TRUST_PROXY = '';
  assert.equal(guard.clientAddress(socket), '172.18.0.5');
});

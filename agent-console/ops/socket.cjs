'use strict';
const fs = require('node:fs');
const tls = require('node:tls');
const net = require('node:net');

process.umask(0o077);
const socket = '/bridge/console.sock';
try {
  if (!fs.lstatSync(socket).isSocket()) throw Error('Unexpected file at socket path');
  fs.unlinkSync(socket);
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
tls.createServer({
  cert: fs.readFileSync('/bridge/cert.pem'), key: fs.readFileSync('/bridge/key.pem'), minVersion:'TLSv1.3'
}, client => {
  const backend = net.connect(4318, '127.0.0.1');
  client.on('error', () => backend.destroy());
  backend.on('error', () => client.destroy());
  client.on('close', () => backend.destroy());
  backend.on('close', () => client.destroy());
  client.pipe(backend).pipe(client);
}).listen(socket);

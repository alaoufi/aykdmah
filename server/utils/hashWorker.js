// Runs bcrypt off the main thread (see utils/hash.js). Messages: { id, op: 'hash'|'compare', a, b }.
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', ({ id, op, a, b }) => {
  const done = op === 'hash' ? bcrypt.hash(a, b) : bcrypt.compare(a, b);
  done.then(result => parentPort.postMessage({ id, result }), error => parentPort.postMessage({ id, error: error.message }));
});

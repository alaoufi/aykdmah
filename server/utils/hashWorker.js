// Runs bcrypt off the main thread (see utils/hash.js). Messages: { id, op: 'hash'|'compare', a, b }.
// One job at a time, start to finish (the synchronous calls): bcryptjs' asynchronous calls take
// turns in small slices, so 40 people signing in together ALL waited until the very end (4.6 s
// each in the simulator, AYK-250). In order, the first is answered after one hash, not forty.
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', ({ id, op, a, b }) => {
  try {
    parentPort.postMessage({ id, result: op === 'hash' ? bcrypt.hashSync(a, b) : bcrypt.compareSync(a, b) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});

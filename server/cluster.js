// The primary of the server copies (see server.js, AYK-251): starts them, restarts one that dies,
// and stops them all together. It serves no requests itself.
const cluster = require('cluster');
const { setupPrimary } = require('@socket.io/cluster-adapter');

function startPrimary(count) {
  setupPrimary(); // lets every copy's live connections reach the others
  let stopping = false;
  const fork = index => {
    const worker = cluster.fork({ APP_WORKER_INDEX: String(index) });
    worker.appIndex = index;
  };
  for (let i = 0; i < count; i++) fork(i);
  console.log(`[cluster] ${count} server copies started`);
  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    console.error(`[cluster] copy ${worker.appIndex} stopped (${signal || code}); starting it again`);
    setTimeout(() => { if (!stopping) fork(worker.appIndex); }, 1000);
  });
  const stop = signal => {
    if (stopping) return;
    stopping = true;
    for (const worker of Object.values(cluster.workers)) worker.process.kill(signal);
    setTimeout(() => process.exit(0), 11000).unref();
    let left = Object.keys(cluster.workers).length;
    cluster.on('exit', () => { if (--left <= 0) process.exit(0); });
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

module.exports = { startPrimary };

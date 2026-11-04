'use strict';
// The tools and the authenticated CLI share only this Unix transport. The
// networkless tools container cannot see the client's network, files, or PID tree.
const net = require('node:net');
const { spawn } = require('node:child_process');
const toolSide = process.argv[2] === 'tools';
const tcp = { host: '127.0.0.1', port: 18765 };
const socket = '/ipc/exec.sock';
if (toolSide) {
  setTimeout(() => process.exit(1), 390000).unref();
  const exec = spawn('codex', ['exec-server', '--listen', 'ws://127.0.0.1:18765'], {stdio:'ignore'});
  exec.on('exit', () => process.exit(1));
}
const relay = net.createServer(local => {
  const remote = net.connect(toolSide ? tcp : socket);
  remote.on('error', () => local.destroy());
  local.on('error', () => remote.destroy());
  local.pipe(remote).pipe(local);
});
relay.listen(toolSide ? socket : tcp, () => {
  if (toolSide) return;
  let limited = false;
  const cli = spawn('codex', process.argv.slice(3), {stdio:['inherit','pipe','ignore']});
  const stream = require('node:readline').createInterface({input:cli.stdout});
  stream.on('line', line => {
    try { if (require('./quota.cjs').quotaEvent(JSON.parse(line))) limited = true; } catch {}
  });
  cli.on('error', () => process.exit(1));
  cli.on('close', code => process.exit(code && limited ? 75 : code ?? 1));
});

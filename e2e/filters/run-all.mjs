#!/usr/bin/env node
// AYK-496: starts the disposable stack (e2e/filters/stack.cjs), runs every filter test against it, stops it and
// drops its database. Exit code 1 when any test failed.
//   AYK_TEST_PORT=55432 node e2e/filters/run-all.mjs [api|ui|all]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const what = process.argv[2] || 'all';
const API = ['api-requests.mjs', 'api-providers.mjs', 'api-lists.mjs', 'api-fuzz.mjs'];
const UI = ['ui-guest.e2e.mjs', 'ui-provider.e2e.mjs', 'ui-requester.e2e.mjs', 'ui-admin.e2e.mjs'];
const files = what === 'api' ? API : what === 'ui' ? UI : [...API, ...UI];
const out = path.join(here, '.out'); fs.mkdirSync(out, { recursive: true });
try { fs.unlinkSync(path.join(out, 'fixtures.json')); } catch (_) { /* none yet */ }

const stack = spawn(process.execPath, [path.join(here, 'stack.cjs')], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
let ready = false, stackLog = '';
stack.stdout.on('data', chunk => { stackLog += chunk; if (stackLog.includes('[ready]')) ready = true; if (/\[stack failed\]/.test(stackLog)) console.log(stackLog.slice(-800)); });
const stop = () => new Promise(resolve => { if (stack.exitCode !== null) return resolve(); stack.once('exit', resolve); stack.kill('SIGTERM'); setTimeout(() => stack.kill('SIGKILL'), 20000); });
process.on('SIGINT', () => stop().then(() => process.exit(130)));
const started = Date.now();
while (!ready) {
  if (stack.exitCode !== null) { console.error('The test stack did not start.\n' + stackLog.slice(-1500)); process.exit(1); }
  if (Date.now() - started > 600000) { await stop(); console.error('The test stack took too long to start.'); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
console.log(`stack ready after ${((Date.now() - started) / 1000).toFixed(0)} s`);
let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const code = await new Promise(resolve => { const child = spawn(process.execPath, [path.join(here, file)], { env: process.env, stdio: 'inherit' }); child.on('exit', c => resolve(c ?? 1)); });
  if (code !== 0) failed += 1;
}
await stop();
console.log(failed ? `\n${failed} test file(s) failed` : '\nall filter tests passed');
process.exit(failed ? 1 : 0);

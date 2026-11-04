'use strict';

const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { openQueue, LEASE_MS } = require('./queue.cjs');
const { executeTask } = require('./runner.cjs');
const { projects } = require('./projects.json');

async function processOne(q, project, execute = executeTask) {
  const job = q.claim(project);
  if (!job) return false;
  // Lease loss never authorizes a second execution. The next poll quarantines
  // the job and both resources until the operator reconciles external effects.
  const heartbeat = setInterval(() => {
    try {
      if (!q.renew(job)) console.error('Task lease expired; reconciliation required');
    } catch {
      console.error('Could not renew task lease');
    }
  }, LEASE_MS / 3);
  try {
    const result = await execute({
      id: job.id, project, requested: job.provider, text: job.text,
      acceptance: job.acceptance, onProgress: () => {},
    });
    if (!result || !result.status) throw Error('Missing execution outcome');
    q.finish(job, result);
  } finally {
    // On an unexpected exception, leave the claim for explicit reconciliation.
    clearInterval(heartbeat);
  }
  return true;
}

async function main() {
  const project = process.env.AGENT_WORKER_PROJECT;
  const command = process.argv[2];
  if (command && !['--reconcile','--resume'].includes(command)) throw Error('Unknown worker command');
  if (!command) {
    if (process.env.AGENT_WORKER_ENABLED !== '1' || process.env.AGENT_CLI_ENABLED !== '1') {
      throw Error('Worker disabled; enable both flags after isolation and subscription setup');
    }
    if (!projects.some(p => p.id === project)) throw Error('Select a known AGENT_WORKER_PROJECT');
  }
  const q = openQueue(process.env.AGENT_DATA_DIR || path.join(__dirname, '.private-agent-data'));
  try {
    if (command === '--resume') {
      if (!q.resume(process.argv[3])) throw Error('Only tasks blocked before dispatch can be resumed');
      console.log('Original task queued for execution');
      return;
    }
    if (command === '--reconcile') {
      // Operator-only, after confirming the CLI and all descendants are stopped
      // and inspecting their worktree. Reconciliation never replays a task.
      if (process.argv[4] !== '--confirmed-stopped' || !q.reconcile(process.argv[3])) {
        throw Error('Expected an interrupted task id and --confirmed-stopped');
      }
      console.log('Resources released; existing task remains pending review');
      return;
    }
    let stopping = false;
    const stop = () => { stopping = true; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    while (!stopping) {
      if (!await processOne(q, project)) await delay(3000);
    }
  } finally {
    q.close();
  }
}

if (require.main === module) main().catch(() => {
  console.error('Worker stopped. Verify configuration and inspect private queue status before restarting.');
  process.exitCode = 1;
});
module.exports = { processOne };

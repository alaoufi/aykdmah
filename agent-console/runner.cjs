'use strict';
// The queue worker has no provider credentials, Docker socket, or project checkout.
const net = require('node:net');

const socketPath = '/run/agent-bridge/worker.sock';
async function executeTask({ id, project, requested, text, acceptance }) {
  if (requested === 'claude') {
    return {status: 'paused', retrySafe: true, message: 'Claude احتياطي. يتطلب تسليمًا يدويًا عبر Claude Code الرسمي وموافقة المالك.'};
  }
  if (requested !== 'codex' || !text?.trim() || !acceptance?.trim()) {
    return {status: 'needs-clarification', message: 'حدد الطلب ومعايير القبول وطريقة الاختبار.'};
  }
  if (!['aykdmah','trbhh'].includes(project) || !/^[0-9a-f-]{36}$/.test(id)) throw Error('Invalid project or task id');
  return new Promise((resolve, reject) => {
    const conn = net.createConnection({path: socketPath, allowHalfOpen: true});
    let connected = false, response = '';
    conn.once('connect', () => {
      connected = true;
      conn.end(JSON.stringify({id, project, text, acceptance}) + '\n');
    });
    conn.setEncoding('utf8');
    conn.on('data', chunk => {
      response += chunk;
      if (response.length > 64000) conn.destroy(Error('Invalid bridge response'));
    });
    conn.setTimeout(1000 * 1000, () => conn.destroy(Error('Bridge timeout')));
    conn.on('error', error => {
      if (!connected && ['ENOENT','ECONNREFUSED','EACCES'].includes(error.code)) {
        resolve({status:'blocked',retrySafe:true,message:'خدمة التشغيل المعزولة غير متاحة.'});
      } else reject(Error('Execution interrupted; inspect the private task checkout'));
    });
    conn.on('end', () => {
      try { resolve(JSON.parse(response)); } catch { reject(Error('Execution outcome unknown')); }
    });
  });
}
module.exports = { executeTask };

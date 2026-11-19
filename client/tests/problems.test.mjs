import test from 'node:test';
import assert from 'node:assert/strict';
import { explainProblem } from '../src/utils/problems.js';

const t = (key) => key;
const apiErr = (status, data = {}) => ({ response: { status, data } });

test('every refusal says what happened, why, and the way out with a direct link', () => {
  const admin = explainProblem(apiErr(403, { message: 'سبب', errors: { code: 'admin_account' } }), t);
  assert.equal(admin.reason, 'سبب');
  assert.equal(admin.fix, 'problem.fix_admin_account');
  assert.deepEqual(admin.actions.map(a => a.to), ['/register?role=provider']);
  assert.equal(admin.actions[0].signOut, true);
  const jobs = explainProblem(apiErr(409, { message: 'm', errors: { code: 'active_jobs', jobs: [{ id: 5, title: 'x' }] } }), t);
  assert.equal(jobs.jobs[0].id, 5);
  const open = explainProblem(apiErr(409, { errors: { code: 'open_requests', jobs: [] } }), t);
  assert.deepEqual(open.actions.map(a => a.handler || a.to), ['choose_both', '/client']);
  assert.equal(explainProblem(apiErr(403, { message: 'غير مسموح' }), t).actions[0].to, '/support');
  assert.equal(explainProblem(apiErr(401), t).actions[0].to, '/login');
  assert.equal(explainProblem(apiErr(423), t).actions[0].to, '/forgot-password');
  assert.equal(explainProblem(apiErr(404), t).actions[0].to, '/');
  assert.equal(explainProblem(apiErr(500), t).title, 'problem.title_server');
  assert.equal(explainProblem({ message: 'Network Error' }, t).title, 'problem.title_network');
});

test('a plain message still gets a reason and a way out; nothing gives nothing', () => {
  const plain = explainProblem('نص الخطأ', t);
  assert.equal(plain.reason, 'نص الخطأ');
  assert.equal(plain.actions[0].to, '/support');
  assert.equal(explainProblem('', t), null);
  assert.equal(explainProblem(null, t), null);
});

test('a closed conversation (call or message refused) offers a new conversation', () => {
  const closed = explainProblem(apiErr(403, { message: 'call_forbidden' }), t);
  assert.equal(closed.title, 'problem.title_chat_closed');
  assert.deepEqual(closed.actions.map(a => a.handler || a.to), ['start_new', '/chat']);
});

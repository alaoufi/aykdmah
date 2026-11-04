const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function model(writable = true, {readable = writable} = {}) {
  const inserted = [];
  const conn = {
    query: async sql => {
      if (sql.includes('SELECT reader.id FROM conversation_participants reader')) return [readable ? [{id:1}] : []];
      if (sql.includes('SELECT client_id')) return [[{client_id:1,assigned_provider_id:2,status:'assigned'}]];
      if (sql.includes('SELECT status FROM offers')) return [[{status:'accepted'}]];
      if (sql.includes('SELECT id, role FROM users')) return [[{id:1,role:'client'},{id:2,role:'provider'}]];
      if (sql.includes('SELECT c.id FROM conversations')) return [[{id:9}]];
      if (sql.includes('SELECT request_id FROM conversations')) return [[{request_id:7}]];
      if (sql.includes('SELECT cp.id FROM conversation_participants')) return [writable ? [{id:1}] : []];
      return [[{id:1}]];
    },
    execute: async (sql,params) => {inserted.push({sql,params});return [{insertId:42}];},
  };
  const context={module:{exports:{}},require:name=>name.endsWith('/database')?{transaction:fn=>fn(conn)}:{notBlockedSql:()=> 'TRUE'}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../models/Conversation'),'utf8'),context);
  return {c:context.module.exports,inserted,conn};
}
test('fresh conversation preserves request and both participant identities without replacing history',async()=>{
  const {c,inserted}=model();
  assert.equal(await c.findOrCreateBetween(1,2,7),9);assert.equal(inserted.length,0);
  assert.equal(await c.findOrCreateBetween(1,2,7,{fresh:true}),42);
  assert.equal(inserted[0].params[0],7);
  assert.ok(inserted.every(row=>!/^UPDATE|^DELETE/.test(row.sql)));
});

test('transactional forwarding source gate permits readable history but rejects removed membership',async()=>{
  const history=model(false,{readable:true});
  assert.equal(typeof history.c.assertCanRead,'function');
  assert.equal(await history.c.assertCanRead(9,1,history.conn),true);
  const removed=model(false,{readable:false});
  await assert.rejects(removed.c.assertCanRead(9,1,removed.conn),{status:403});
});
test('fresh conversation cannot bypass a closed or blocked existing conversation',async()=>{
  const {c,inserted}=model(false);
  await assert.rejects(c.findOrCreateBetween(1,2,7,{fresh:true}),{status:403});
  assert.equal(inserted.length,0);
});

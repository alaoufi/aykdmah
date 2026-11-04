const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function controller({ messages = [], denied = [], participant = true, notificationFails = false, persistFails = [] } = {}) {
  const writes = []; const receipts=new Map();const failing=new Set(persistFails);
  const Conversation = { isParticipant: async () => participant, canSend: async id => !denied.includes(id),getParticipants:async()=>{if(notificationFails)throw Error('notification failed');return [];} };
  const Message = { getForwardReceipt:async(_,__,target)=>receipts.get(target), forwardToTarget:async input=>{if(receipts.has(input.targetId))return {messageIds:receipts.get(input.targetId).message_ids,replayed:true};if(failing.has(input.targetId))throw Error('persist failed');writes.push(input);const messageIds=input.messages.map(m=>m.id+100);receipts.set(input.targetId,{fingerprint:input.fingerprint,message_ids:messageIds});return {messageIds,replayed:false};}, findById: async id => messages.find(m => m.id === Number(id)) || { id }, create: async data => { writes.push(data); return 99; }, searchInConversation: async () => [{id:1,sender_id:2,sender_role:'client',sender_name:'Private name',content:'hello'}] };
  const noop = async () => {};
  const requireStub = name => {
    if(name === 'node:crypto') return require('node:crypto');
    if (name.endsWith('/Conversation')) return Conversation;
    if (name.endsWith('/Message')) return Message;
    if (name.endsWith('/chatMessageValidation')) return require('../utils/chatMessageValidation');
    if (name.endsWith('/asyncHandler')) return fn => fn;
    if (name.endsWith('/requesterPrivacy')) return { hideRequesterNames: async (_, people) => { people.forEach(p => {p.full_name='Requester';}); } };
    if (name.endsWith('/apiResponse')) return Object.fromEntries(['success','created','error','notFound','forbidden'].map(key => [key, (_,value) => ({key,value})]));
    if (name.endsWith('/conversationEvents')) return {emitConversation:noop};
    return new Proxy({}, {get:()=>noop});
  };
  const context = {require:requireStub,module:{exports:{}},Map,Set,console,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/chatController'),'utf8'), context);
  const req = {params:{id:'10'},query:{q:'hello'},user:{id:5},body:{operation_id:'12345678-1234-4234-8234-123456789012',message_ids:[1],conversation_ids:[20]},t:key=>key,app:{get:()=>null}};
  return {c:context.module.exports,req,writes,failing};
}
test('message search hides requester identity and rejects structured q', async () => {
  const {c,req}=controller();
  const result=await c.searchMessages(req,{});
  assert.equal(result.value[0].sender_name,'Requester');
  assert.equal(result.value[0].sender_role,undefined);
  req.query.q=['private']; await assert.rejects(c.searchMessages(req,{}),{status:400});
});
test('forward preflight rejects foreign sources, system/location and any unauthorized target before writing',async()=>{
  for(const message of [{id:1,sender_id:4,message_type:'text',conversation_id:10},{id:1,sender_id:5,message_type:'system',conversation_id:10},{id:1,sender_id:5,message_type:'location',conversation_id:10},{id:1,sender_id:5,message_type:'text',conversation_id:11}]) {
    const {c,req,writes}=controller({messages:[message]});
    assert.equal((await c.forwardMessages(req,{})).key,'notFound');assert.equal(writes.length,0);
  }
  const {c,req,writes}=controller({messages:[{id:1,sender_id:5,message_type:'voice',conversation_id:10}],denied:[21]});
  req.body.conversation_ids=[20,21];assert.equal((await c.forwardMessages(req,{})).key,'forbidden');assert.equal(writes.length,0);
});
test('forward passes chronological sources and the same operation to each atomic target',async()=>{
  const {c,req,writes}=controller({messages:[{id:1,sender_id:5,message_type:'voice',conversation_id:10,reply_to_id:8,files:[{file_url:'/api/media/a',file_name:'voice',file_type:'audio/mp4',file_size:20}]},{id:2,sender_id:5,message_type:'text',conversation_id:10,content:'later'}]});
  req.body={operation_id:'12345678-1234-4234-8234-123456789012',message_ids:[2,1],conversation_ids:[20,21]};
  const result=await c.forwardMessages(req,{});assert.equal(result.value.count,4);
  assert.equal(writes.length,2);assert.equal(writes[0].messages[0].message_type,'voice');assert.equal(writes[0].messages[1].content,'later');
  assert.equal(writes[0].targetId,20);assert.equal(writes[1].targetId,21);
  assert.equal(writes[0].operationId,req.body.operation_id);
});

test('notification failure does not turn committed copies into persistence failure or duplicate a retry',async()=>{
  const {c,req,writes}=controller({messages:[{id:1,sender_id:5,message_type:'text',conversation_id:10,content:'hello'}],notificationFails:true});
  const sent=(await c.forwardMessages(req,{})).value;
  assert.equal(sent.count,1);assert.equal(sent.results[0].success,true);assert.equal(sent.results[0].delivery_error,true);
  const retry=(await c.forwardMessages(req,{})).value;
  assert.equal(retry.count,1);assert.equal(retry.results[0].replayed,true);assert.equal(writes.length,1);
});
test('failed targets report zero persisted copies and a subset retry leaves completed targets untouched',async()=>{
  const {c,req,writes,failing}=controller({messages:[{id:1,sender_id:5,message_type:'text',conversation_id:10,content:'hello'}],persistFails:[21]});
  req.body.conversation_ids=[20,21];
  const result=(await c.forwardMessages(req,{})).value;
  assert.equal(result.count,1);assert.equal(result.results[1].success,false);assert.equal(result.results[1].count,0);
  failing.clear();req.body.conversation_ids=[21];
  assert.equal((await c.forwardMessages(req,{})).value.count,1);assert.equal(writes.length,2);
  req.body.conversation_ids=[20,21];const replay=(await c.forwardMessages(req,{})).value;
  assert.equal(replay.count,2);assert.equal(writes.length,2);assert.ok(replay.results.every(r=>r.replayed));
});

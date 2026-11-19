const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(){
  let messages=[],receipts=[],media=[],fail=false,readable=true;let sequence=100;
  const query=async(sql,params)=>{
    if(sql.includes('INSERT INTO message_files')){media.push(params);return [[]];}
    if(sql.includes('chat_forward_receipts')) return [receipts.filter(r=>r.sender_id===params[0]&&r.operation_id===params[1]&&(params.length<3||r.target_conversation_id===params[2]))];
    if(sql.includes('FROM messages WHERE'))return [[{id:1},{id:2}]];
    if(sql.includes('conversation_participants'))return [[{id:1}]];
    return [[]];
  };
  const conn={query,execute:async(sql,params)=>{
    if(sql.includes('INSERT INTO messages')){if(fail&&params[2]==='second')throw Error('mid-batch failure');const id=++sequence;messages.push({id,sender_id:params[1],content:params[2],reply_to_id:params[4]});return [{insertId:id}];}
    if(sql.includes('INSERT INTO chat_forward_receipts'))receipts.push({sender_id:params[0],operation_id:params[1],target_conversation_id:params[2],fingerprint:params[3],message_ids:JSON.parse(params[4])});
    return [{insertId:1}];
  }};
  const db={query:async(...args)=>(await query(...args))[0],queryOne:async(...args)=>(await query(...args))[0][0],transaction:async run=>{const a=messages.slice(),b=receipts.slice(),c=media.slice();try{return await run(conn);}catch(error){messages=a;receipts=b;media=c;throw error;}}};
  const load=()=>{const context={module:{exports:{}},require:name=>name.endsWith('/database')?db:name.endsWith('/Conversation')?{assertCanSend:async()=>true,assertCanRead:async()=>{if(!readable)throw Object.assign(new Error('Source revoked'),{status:403});return true;}}:name.endsWith('/verificationPolicy')?{assertMarketplaceWriteAccess:async()=>true}:name.endsWith('/chatMessageValidation')?require('../utils/chatMessageValidation'):{}};vm.runInNewContext(fs.readFileSync(require.resolve('../models/Message'),'utf8'),context);return context.module.exports;};
  return {load,readable:value=>{readable=value;},fail:value=>{fail=value;},count:()=>messages.length,receipts:()=>receipts.length,copies:()=>messages,media:()=>media};
}
test('forward target commits all messages and its durable receipt atomically; retries after reload never duplicate',async()=>{
  const h=harness();let m=h.load();assert.equal(typeof m.forwardToTarget,'function');
  const input={sourceId:10,targetId:20,senderId:5,operationId:'12345678-1234-4234-8234-123456789012',fingerprint:'a'.repeat(64),messages:[{id:1,sender_id:99,reply_to_id:9,content:'first',message_type:'text',files:[{file_url:'/api/media/owned',file_name:'owned.pdf',file_type:'application/pdf',file_size:10,private_author:'must not copy'}]},{id:2,content:'second',message_type:'text'}]};
  const first=await m.forwardToTarget(input);assert.equal(first.messageIds.length,2);assert.equal(h.count(),2);assert.equal(h.receipts(),1);assert.equal(h.copies()[0].sender_id,5);assert.equal(h.copies()[0].reply_to_id,null);assert.equal(h.media()[0][1],'/api/media/owned');assert.equal(h.media()[0].length,6);
  m=h.load();const replay=await m.forwardToTarget(input);assert.equal(replay.replayed,true);assert.equal(h.count(),2);
  await assert.rejects(m.forwardToTarget({...input,fingerprint:'b'.repeat(64)}),{status:409});assert.equal(h.count(),2);
  h.fail(true);await assert.rejects(m.forwardToTarget({...input,targetId:21}),/mid-batch/);assert.equal(h.count(),2);assert.equal(h.receipts(),1);
  h.fail(false);h.readable(false);await assert.rejects(m.forwardToTarget({...input,targetId:21}),{status:403});assert.equal(h.count(),2);h.readable(true);await m.forwardToTarget({...input,targetId:21});assert.equal(h.count(),4);assert.equal(h.receipts(),2);
});

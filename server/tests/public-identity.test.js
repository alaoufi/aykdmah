const test=require('node:test'); const assert=require('node:assert/strict'); const vm=require('node:vm');const fs=require('node:fs');
function privacy() {
  const context={module:{exports:{}},require:()=>({query:async(_,params)=>params[0]===2?[{provider_id:1,nickname:'Saved customer'}]:[]})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/requesterPrivacy'),'utf8'),context);
  return context.module.exports;
}
test('socket message identities are copied per viewer, retaining own/provider names and saved requester aliases',async()=>{
  const p=privacy();assert.equal(typeof p.messageForViewer,'function');
  const message={id:8,sender_id:1,sender_role:'client',sender_name:'Secret requester',reply_sender_id:3,reply_sender_role:'provider',reply_sender_name:'Public worker'};
  const own=await p.messageForViewer(message,1,'Requester');assert.equal(own.sender_name,'Secret requester');
  const saved=await p.messageForViewer(message,2,'Requester');assert.equal(saved.sender_name,'Saved customer');assert.equal(saved.reply_sender_name,'Public worker');
  const stranger=await p.messageForViewer(message,4,'Requester');assert.equal(stranger.sender_name,'Requester');assert.equal(stranger.sender_role,undefined);
  assert.equal(message.sender_name,'Secret requester');assert.equal(message.sender_role,'client');
});
test('public review API protects requester identities, avatars and private request links for visitors and preserves self/provider names',async()=>{
  const p=privacy();assert.equal(typeof p.reviewsForViewer,'function');
  const row={id:9,reviewer_id:1,reviewer_role:'client',reviewer_name:'Secret requester',reviewer_avatar:'/private-face',target_user_id:3,target_role:'provider',target_name:'Public worker',request_id:44,request_title:'Private job',rating:5,comment:'Public opinion',report_count:1};
  const visitor=(await p.reviewsForViewer([row],null,'Requester'))[0];
  assert.equal(visitor.reviewer_name,'Requester');assert.equal(visitor.reviewer_avatar,null);assert.equal(visitor.target_name,'Public worker');
  for(const field of ['reviewer_id','target_user_id','request_id','request_title','report_count','reviewer_role','target_role']) assert.equal(visitor[field],undefined,field);
  assert.equal((await p.reviewsForViewer([row],1,'Requester'))[0].reviewer_name,'Secret requester');
  assert.equal((await p.reviewsForViewer([row],2,'Requester'))[0].reviewer_name,'Saved customer');
  const reverse={...row,reviewer_id:3,reviewer_role:'provider',reviewer_name:'Public worker',target_user_id:1,target_role:'client',target_name:'Secret requester',target_avatar:'/private-face'};
  assert.equal((await p.reviewsForViewer([reverse],null,'Requester'))[0].target_name,'Requester');
  assert.equal((await p.reviewsForViewer([reverse],1,'Requester'))[0].target_name,'Secret requester');
});

test('shared chat emitter sends different sanitized objects through authenticated individual sockets',async()=>{
  const emitted=[];const p=privacy();
  const context={module:{exports:{}},require:name=>name.endsWith('/Conversation')?{getParticipants:async()=>[{id:1},{id:2},{id:4}]}:name==='./requesterPrivacy'?p:name==='./i18n'?{translate:()=> 'Requester'}:{validateToken:async token=>({id:Number(token)})}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/conversationEvents'),'utf8'),context);
  const io={in:room=>({fetchSockets:async()=>[{id:room,authToken:room.split(':')[1]}]}),to:id=>({emit:(event,payload)=>emitted.push({id,event,payload})})};
  await context.module.exports.emitConversation(io,10,'chat:message',{sender_id:1,sender_role:'client',sender_name:'Secret requester',content:'hello'});
  assert.equal(emitted[0].payload.sender_name,'Secret requester');assert.equal(emitted[1].payload.sender_name,'Saved customer');assert.equal(emitted[2].payload.sender_name,'Requester');
  assert.notEqual(emitted[0].payload,emitted[1].payload);
});

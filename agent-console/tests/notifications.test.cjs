'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const os=require('node:os'), fs=require('node:fs'), path=require('node:path');
const {openAuth}=require('../auth.cjs'), {openNotifications}=require('../notifications.cjs');
test('consented browser receives only generic task id once per transition, logout revokes subscription',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'private-push-'));
  const auth=openAuth(tmp,'test-only'), delivered=[];
  const task={id:'sample',status:'blocked',finishedAt:new Date(Date.now()+1000).toISOString(),message:'private data'};
  const push=openNotifications(auth,{jobs:()=>[task]},[{id:'example'}],'https://example.test',async(_,payload)=>delivered.push(JSON.parse(payload)));
  try {
    await push.deliver(); assert.equal(delivered.length,0);
    assert.ok(push.subscribe({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}},'session'));
    await push.deliver(); await push.deliver();
    assert.deepEqual(delivered,[{tag:'sample'}]);
    task.status='needs-verification';task.finishedAt=new Date(Date.now()+2000).toISOString();
    await push.deliver();assert.deepEqual(delivered,[{tag:'sample'},{tag:'sample'}]);
    push.logout('session');task.finishedAt=new Date(Date.now()+3000).toISOString();
    await push.deliver();assert.equal(delivered.length,2);
  }finally{push.close();auth.close();fs.rmSync(tmp,{recursive:true,force:true});}
});

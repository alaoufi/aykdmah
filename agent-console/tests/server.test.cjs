'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {start}=require('../server.cjs');
const {validSubscription}=require('../notifications.cjs');
const origin='https://agent.test';
async function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'private-console-'));
  const env={AGENT_ORIGIN:origin,AGENT_CONSOLE_PASSWORD:crypto.randomBytes(24).toString('hex'),SESSION_SECRET:crypto.randomBytes(32).toString('hex'),AGENT_DATA_DIR:dir,PORT:0};
  let server;
  async function stop(){if(server?.listening)await new Promise(resolve=>server.close(resolve));}
  async function boot(){server=start(env);await once(server,'listening');}
  await boot();
  t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
  async function request(route,data,token='',headers={}) {
    return new Promise((resolve,reject)=>{
      const req=require('node:http').request({hostname:'127.0.0.1',port:server.address().port,path:route,
        method:data?'POST':'GET',headers:{Host:'agent.test',Connection:'close',Cookie:token,...(data?{Origin:origin,'Content-Type':'application/json','X-Agent-Request':'1'}:{}),...headers}
      },res=>{
        const chunks=[];
        res.on('data',c=>chunks.push(c));
        res.on('end',()=>resolve({status:res.statusCode,headers:{get:n=>[].concat(res.headers[n.toLowerCase()] || []).join(';')},json:()=>JSON.parse(Buffer.concat(chunks))}));
      });
      req.on('error',reject);req.end(data?JSON.stringify(data):undefined);
    });
  }
  async function login(){const r=await request('/api/login',{password:env.AGENT_CONSOLE_PASSWORD});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  return {request,login,env,port:()=>server.address().port,async restart(){await stop();await boot();}};
}
test('two owner sessions sync the same job, isolate projects, preserve acceptance and results after restart',async t=>{
  const f=await fixture(t), a=await f.login(), b=await f.login();
  const data={id:crypto.randomUUID(),project:'aykdmah',agent:'auto',text:'تحقق من المثال',acceptance:'اختبار الجمع'};
  assert.equal((await f.request('/api/messages',data,a)).status,201);
  assert.equal((await f.request('/api/messages',data,a)).status,200);
  assert.equal((await f.request('/api/messages',{...data,text:'طلب مختلف'},a)).status,409);
  await f.restart();
  assert.equal((await (await f.request('/api/messages?project=aykdmah',null,b)).json()).messages.length,1);
  assert.equal((await (await f.request('/api/jobs?project=trbhh',null,b)).json()).tasks.length,0);
  assert.equal((await (await f.request('/api/jobs?project=aykdmah',null,b)).json()).tasks[0].status,'pending');
  const protect={...data,id:crypto.randomUUID(),text:'انشر الإنتاج',acceptance:'نشر'};
  await f.request('/api/messages',protect,a);
  assert.equal((await (await f.request('/api/jobs?project=aykdmah',null,b)).json()).tasks[0].status,'needs-approval');
  const clarify={...data,id:crypto.randomUUID(),acceptance:''};
  await f.request('/api/messages',clarify,a);
  assert.equal((await f.request('/api/clarify',{id:clarify.id,project:'aykdmah',acceptance:'اختبار مستقل'},b)).status,200);
});
test('rejects spoofed origins and host, plaintext origin, missing CSRF header, invalid cookie and forged subscriptions',async t=>{
  const f=await fixture(t), data={password:f.env.AGENT_CONSOLE_PASSWORD};
  assert.throws(()=>start({...f.env,AGENT_ORIGIN:'http://agent.test'}));
  assert.equal((await f.request('/api/login',data,'',{Origin:'http://agent.test'})).status,403);
  assert.equal((await f.request('/api/login',data,'',{Origin:''})).status,403);
  assert.equal((await f.request('/api/login',data,'',{'X-Agent-Request':''})).status,403);
  assert.equal((await f.request('/',null,'',{Host:'evil.test'})).status,403);
  assert.equal((await f.request('/api/login',data,'',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.request('/api/projects',null,'__Host-agent_session=%')).status,401);
  const r=await f.request('/api/login',data),cookie=r.headers.get('set-cookie');
  for (const prop of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(prop));
  const a=cookie.split(';')[0];
  assert.equal((await f.request('/api/notifications',{endpoint:'https://127.0.0.1/internal'},a)).status,400);
  assert.equal((await f.request('/api/logout',{},a)).status,200);
  assert.equal((await f.request('/api/projects',null,a)).status,401);
  const shell=await f.request('/');
  assert.equal(shell.headers.get('Cache-Control'),'no-store');
  assert.ok(!shell.headers.get('Content-Security-Policy').includes('unsafe-inline'));
});
test('login limit persists after restart and ignores spoofed client IP',async t=>{
  const f=await fixture(t);
  for(let i=0;i<8;i++)assert.equal((await f.request('/api/login',{password:'bad'})).status,401);
  await f.restart();
  assert.equal((await f.request('/api/login',{password:f.env.AGENT_CONSOLE_PASSWORD},'',{'X-Forwarded-For':'203.0.113.1'})).status,429);
});
test('Web Push rejects untrusted addresses even with well-formed subscription keys',()=>{
  const keys={auth:'a'.repeat(22),p256dh:'a'.repeat(87)};
  assert.ok(validSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/token',keys}));
  assert.ok(!validSubscription({endpoint:'https:fcm.googleapis.com/foo',keys}));
  for(const host of ['fcm.googleapis.com.evil.test','127.0.0.1','evil.test','fcm.googleapis.com:4318','user@fcm.googleapis.com'])
    assert.ok(!validSubscription({endpoint:'https://'+host+'/x',keys}));
});

test('simultaneous incomplete login requests cannot each use the same remaining attempt',async t=>{
  const f=await fixture(t), reqs=[];
  const responses=Array.from({length:20},()=>new Promise((resolve,reject)=>{
    const req=require('node:http').request({host:'127.0.0.1',port:f.port(),path:'/api/login',method:'POST',
      headers:{Host:'agent.test',Origin:origin,'X-Agent-Request':'1','Content-Type':'application/json',Connection:'close'}},
      res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.write('{"password":');reqs.push(req);
  }));
  await new Promise(r=>setTimeout(r,150));
  reqs.forEach(req=>req.end('"bad"}'));
  const codes=await Promise.all(responses);
  assert.equal(codes.filter(c=>c===401).length,8);
  assert.equal(codes.filter(c=>c===429).length,12);
});

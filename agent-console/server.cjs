'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { openQueue, requiresApproval } = require('./queue.cjs');
const { openAuth } = require('./auth.cjs');
const { openNotifications } = require('./notifications.cjs');
const { projects } = require('./projects.json');
const { applications } = require('./store-registry.json');

function start(env = process.env) {
  const origin = new URL(env.AGENT_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.AGENT_ORIGIN)
    throw Error('AGENT_ORIGIN must be the exact private HTTPS origin');
  if (!(env.AGENT_CONSOLE_PASSWORD?.length >= 16 && env.SESSION_SECRET?.length >= 32))
    throw Error('Configure a private password and session secret');
  process.umask(0o077);
  const dir = env.AGENT_DATA_DIR || path.join(__dirname, '.private-agent-data');
  const auth = openAuth(env.AGENT_AUTH_DIR || path.join(dir,'web'),env.SESSION_SECRET);
  const q = openQueue(dir);
  const push = openNotifications(auth,q,projects,origin.origin);
  const files = new Map(Object.entries({
    '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/app.css':['app.css','text/css'],
    '/sw.js':['sw.js','text/javascript'], '/icon.svg':['icon.svg','image/svg+xml'],
    '/icon-180.png':['icon-180.png','image/png'], '/icon-192.png':['icon-192.png','image/png'], '/icon-512.png':['icon-512.png','image/png'],
    '/manifest.webmanifest':['manifest.webmanifest','application/manifest+json']
  }).map(([url,[name,type]]) => [url,{type, data:fs.readFileSync(path.join(__dirname,'public',name))}]));
  const digest = s => crypto.createHash('sha256').update(s).digest();
  const fail = (status,message) => Object.assign(new Error(message),{httpStatus:status});
  const known = id => projects.some(p => p.id === id);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function body(req) {
    let size=0;
    const parts=[];
    for await (const part of req) {
      size+=part.length;
      if (size>48000) throw fail(413,'الطلب طويل جدًا');
      parts.push(part);
    }
    try {
      const obj=JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error();
      return obj;
    } catch { throw fail(400,'صيغة الطلب غير صالحة'); }
  }
  const server=http.createServer(async(req,res) => {
    const json = (code,data) => {
      res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(data));
    };
    try {
      for (const [k,v] of Object.entries({
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
        'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
      })) res.setHeader(k,v);
      if (req.headers.host !== origin.host) return json(403,{error:'عنوان غير معتمد'});
      const file = files.get(req.url);
      if (req.method==='GET' && file) {
        res.writeHead(200,{'Content-Type':file.type+'; charset=utf-8'});
        return res.end(file.data);
      }
      const u = new URL(req.url,origin);
      const post = req.method==='POST';
      if (post && (req.headers.origin !== origin.origin || req.headers['x-agent-request'] !== '1'))
        return json(403,{error:'أعد فتح الواجهة من عنوانها الخاص'});
      if (post && req.headers['content-type']?.split(';')[0] !== 'application/json')
        return json(415,{error:'نوع بيانات غير مقبول'});
      if (post && u.pathname==='/api/login') {
        const ip=req.socket.remoteAddress; // Shared limit behind the trusted private proxy. Ignore forwarded headers.
        const b=await body(req);
        if (auth.blocked(ip)) return json(429,{error:'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.'});
        if (typeof b.password!=='string' || !crypto.timingSafeEqual(digest(b.password),digest(env.AGENT_CONSOLE_PASSWORD))) {
          auth.fail(ip); return json(401,{error:'كلمة المرور غير صحيحة'});
        }
        auth.clear(ip);
        res.setHeader('Set-Cookie','__Host-agent_session='+auth.issue()+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400');
        return json(200,{ok:true});
      }
      const session=auth.verify(req.headers.cookie);
      if (!session) return json(401,{error:'يلزم تسجيل الدخول'});
      if (post && u.pathname==='/api/logout') {
        push.logout(session); auth.revoke(session);
        res.setHeader('Set-Cookie','__Host-agent_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
        return json(200,{ok:true});
      }
      if (req.method==='GET') {
        if (u.pathname==='/api/projects') return json(200,{projects, defaultAgent:'codex',pushKey:push.publicKey});
        if (u.pathname==='/api/stores') return json(200,{applications,connected:false});
        const project=u.searchParams.get('project');
        if (!known(project)) return json(400,{error:'مشروع غير معروف'});
        if (u.pathname==='/api/messages') return json(200,{messages:q.messages(project)});
        if (u.pathname==='/api/handoff') {
          const task=q.handoff(project,u.searchParams.get('id') || '');
          return task ? json(200,{task}) : json(404,{error:'الطلب غير موجود لهذا المشروع'});
        }
        if (u.pathname==='/api/jobs') return json(200,{tasks:q.jobs(project)});
      }
      if (post && u.pathname==='/api/notifications') {
        if (!push.subscribe(await body(req),session)) return json(400,{error:'اشتراك الإشعارات غير صالح'});
        return json(200,{ok:true});
      }
      if (post && ['/api/messages','/api/clarify','/api/resume'].includes(u.pathname)) {
        const b=await body(req);
        if (!known(b.project) || !uuid.test(b.id)) return json(400,{error:'اختر مشروعًا وطلبًا صالحين'});
        const acceptance=typeof b.acceptance==='string' ? b.acceptance.trim() : '';
        if (acceptance.length>2000) return json(400,{error:'معيار القبول طويل جدًا'});
        if (u.pathname==='/api/resume') {
          if (!q.resume(b.id,b.project)) return json(409,{error:'لا يمكن إعادة تنفيذ طلب بدأ تشغيله'});
          return json(200,{ok:true});
        }
        if (u.pathname==='/api/clarify') {
          if (!acceptance || !q.clarify(b.project,b.id,acceptance)) return json(409,{error:'تعذر استكمال هذه المهمة'});
          return json(200,{ok:true});
        }
        const text=typeof b.text==='string' ? b.text.trim() : '';
        if (!text || text.length>8000) return json(400,{error:'اكتب طلبًا لا يتجاوز 8000 حرف'});
        if (!['codex','auto'].includes(b.agent)) return json(409,{error:'Claude احتياطي يدوي حاليًا'});
        const status=requiresApproval(text+'\n'+acceptance) ? 'needs-approval' : acceptance ? 'pending' : 'needs-clarification';
        const created=q.enqueue({id:b.id,project:b.project,agent:'codex',text,acceptance,status});
        return json(created?201:200,{id:b.id,created});
      }
      return json(404,{error:'غير موجود'});
    } catch(e) {
      if (e.code === 'TASK_LIMIT') return json(429,{error:'بلغ المشروع حد الطلبات لهذه الساعة'});
      if (e.code === 'ID_CONFLICT') return json(409,{error:'تغير محتوى طلب محفوظ'});
      if (!e.httpStatus) console.error('Request failed with an internal error');
      return json(e.httpStatus || 500,{error:e.httpStatus?e.message:'تعذر إتمام الطلب'});
    }
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.on('close',()=>{push.close();q.close();auth.close();});
  server.listen(Number(env.PORT ?? 4318),'127.0.0.1');
  return server;
}
if (require.main===module) start();
module.exports={start};

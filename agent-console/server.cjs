// Standalone private console. Node.js 22+, no external runtime dependencies.
// Only starts when AGENT_CONSOLE_PASSWORD and SESSION_SECRET are explicitly set.
// A GitHub issue is created only if GITHUB_TOKEN is supplied; it is not an AI invocation.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const port=Number(process.env.PORT||4318),password=process.env.AGENT_CONSOLE_PASSWORD,secret=process.env.SESSION_SECRET;
if(!password||password.length<16||!secret||secret.length<32)throw Error('Configure a strong AGENT_CONSOLE_PASSWORD (16+) and SESSION_SECRET (32+)');
const registry=JSON.parse(fs.readFileSync(path.join(__dirname,'projects.json'),'utf8'));
const projects=registry.projects.map(p=>({...p,repo:p.repository}));
const storeRegistry=JSON.parse(fs.readFileSync(path.join(__dirname,'store-registry.json'),'utf8'));
const allowed=new Map(projects.map(p=>[p.id,p]));
const configured=(process.env.AGENT_ENABLED_PROVIDERS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const route=(text,requested)=>{
 if(requested==='claude'||requested==='codex')return requested;
 const codes=/(اختبار|راجع|تدقيق|أمان|debug|review|security|test|تحليل)/i;
 const preferred=codes.test(text)?'codex':'claude';
 return configured.includes(preferred)?preferred:(configured.find(x=>x==='claude'||x==='codex')||'unassigned');
};
const dir=process.env.AGENT_DATA_DIR||path.join(process.cwd(),'.private-agent-data');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const file=path.join(dir,'messages.json');const html=fs.readFileSync(path.join(__dirname,'public/index.html'));
let messages=[];try{messages=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(messages))messages=[]}catch{}
const save=()=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(messages),{mode:0o600});fs.renameSync(tmp,file)};
const reply=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const eq=(a,b)=>{const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y)};
const sign=v=>crypto.createHmac('sha256',secret).update(v).digest('hex');
const auth=req=>{const match=(req.headers.cookie||'').match(/(?:^|; )agent_session=([^;]+)/);if(!match)return false;const [stamp,hash]=decodeURIComponent(match[1]).split('.');return /^\d+$/.test(stamp)&&Date.now()-Number(stamp)<86400000&&Number(stamp)<=Date.now()&&eq(hash||'',sign(stamp))};
const safeOrigin=req=>{const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host}catch{return false}};
const getbody=async req=>{let parts='',size=0;for await(const c of req){size+=c.length;if(size>10000)throw Error('الطلب طويل جدًا');parts+=c}return JSON.parse(parts)};
const github=async(text,agent,project)=>{const token=process.env.GITHUB_TOKEN;if(!token)return null;
const [owner,repo]=project.repo.split('/');
const response=await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`,{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'ayk-agent-console','Content-Type':'application/json'},body:JSON.stringify({title:'[Agent request → '+agent+'] '+text.slice(0,75),body:'Requested agent: '+agent+'\nProject: '+project.repo+'\nDeliverables: '+project.deliverables.join(', ')+'\nDeployment authorization: required\n\n'+text+'\n\nThis is a task queue, not proof an AI agent executed it.\n\nFollow AGENTS.md and docs/AI_COORDINATION.md.'})});
if(!response.ok)throw Error('GitHub rejected task ('+response.status+')');const data=await response.json();return data.html_url};
const server=http.createServer(async(req,res)=>{try{
if(req.url==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'",'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'});return res.end(html)}
if(!req.url.startsWith('/api/'))return reply(res,404,{error:'غير موجود'});
if(!safeOrigin(req))return reply(res,403,{error:'مصدر غير مسموح'});
if(req.url==='/api/login'&&req.method==='POST'){const b=await getbody(req);if(!eq(String(b.password||''),password))return reply(res,401,{error:'كلمة المرور غير صحيحة'});const ts=String(Date.now());res.setHeader('Set-Cookie',`agent_session=${ts}.${sign(ts)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);return reply(res,200,{ok:true})}
if(!auth(req))return reply(res,401,{error:'يلزم تسجيل الدخول'});
if(req.url==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','agent_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return reply(res,200,{ok:true})}
if(req.url==='/api/projects'&&req.method==='GET')return reply(res,200,{projects,configuredProviders:configured});
if(req.url==='/api/stores'&&req.method==='GET')return reply(res,200,{applications:storeRegistry.applications,connected:false,warning:'لا يوجد اتصال فعلي بمتاجر التطبيقات حتى إعداد صلاحياتها'});
if(req.url.startsWith('/api/messages')&&req.method==='GET'){
const u=new URL(req.url,'http://localhost');const project=u.searchParams.get('project')||'aykdmah';
if(!allowed.has(project))return reply(res,400,{error:'مشروع غير مصرح به'});
return reply(res,200,{messages:messages.filter(m=>m.project===project)});
}
if(req.url==='/api/messages'&&req.method==='POST'){const b=await getbody(req),text=String(b.text||'').trim(),agent=String(b.agent||'');if(!text||text.length>8000||!['auto','claude','codex'].includes(agent))return reply(res,400,{error:'طلب غير صالح'});
const project=allowed.get(String(b.project||'aykdmah'));if(!project)return reply(res,400,{error:'المشروع غير معروف'});
if(/\b(?:publish|deploy|release)\b|نشر|رفع.*متجر|حذف.*بيانات|دفع.*مبلغ|تغيير.*DNS/i.test(text)){messages.push({id:crypto.randomUUID(),role:'system',project:project.id,text:'تنبيه: هذا الطلب قد يتطلب موافقة المالك قبل نشر أو دفع أو تعديل إنتاج. تسجيل المهمة لا يعني السماح بالتنفيذ.',date:new Date().toISOString()});}

const selected=route(text,agent);const id=crypto.randomUUID();messages.push({id,role:'user',text,date:new Date().toISOString(),agent:selected,project:project.id});save();
try{const url=await github(text,selected,project);messages.push({id:crypto.randomUUID(),role:'system',project:project.id,text:url?'وجهت المهمة إلى '+selected+' في '+project.repo+' وسجلتها في GitHub: '+url+'\nالتنفيذ الآلي غير مفعل حتى توصيل المزود.':'حُفظ الطلب في محادثة '+project.name+'. لم يتم إنشاء مهمة GitHub لغياب GITHUB_TOKEN.',date:new Date().toISOString()})}
catch(e){messages.push({id:crypto.randomUUID(),role:'system',project:project.id,text:'حُفظ الطلب محليًا، لكن تعذر تسجيل مهمة GitHub: '+e.message,date:new Date().toISOString()})}save();return reply(res,200,{ok:true})}
return reply(res,404,{error:'غير موجود'});
}catch(e){return reply(res,400,{error:e.message||'خطأ'})}});
server.listen(port,'127.0.0.1',()=>console.log('Private agent console listening on localhost:'+port));

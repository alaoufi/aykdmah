const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http'), https=require('node:https'), {once}=require('node:events'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {chromium}=require('@playwright/test');
const {start}=require('../server.cjs');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'console-browser-'));
 const cert=path.join(temp,'local.crt'), key=path.join(temp,'local.key');
 require('node:child_process').execFileSync(process.env.AGENT_TEST_OPENSSL || 'openssl',[
   'req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1',
   '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'
 ],{stdio:'ignore'});
 const proxy=https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key)});
 proxy.listen(0,'127.0.0.1');await once(proxy,'listening');const origin='https://127.0.0.1:'+proxy.address().port;
 const pass=crypto.randomBytes(20).toString('hex');
 const app=start({AGENT_ORIGIN:origin,AGENT_CONSOLE_PASSWORD:pass,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),AGENT_DATA_DIR:temp,PORT:0});
 await once(app,'listening');proxy.on('request',(q,s)=>{const r=http.request({hostname:'127.0.0.1',port:app.address().port,path:q.url,headers:q.headers,method:q.method},r=>{s.writeHead(r.statusCode,r.headers);r.pipe(s);});q.pipe(r);});
 const browser=await chromium.launch({executablePath:process.env.AGENT_TEST_BROWSER,headless:true});
 try{
 const failures=[], pages=[];
 for(const dimensions of [{width:1280,height:810},{width:390,height:844}]){
   const c=await browser.newContext({ignoreHTTPSErrors:true,permissions:["clipboard-read","clipboard-write"],viewport:dimensions}); const p=await c.newPage();
   p.on('pageerror',e=>failures.push(e.message)); p.on('console',e=>{if(e.text().includes('Content Security Policy'))failures.push(e.text());});
   await p.goto(origin);await p.fill('#password',pass);await p.click('#loginForm button'); await p.locator('#send').waitFor(); pages.push(p);
 }
 const [desktop,mobile]=pages;
 await desktop.fill('#prompt','مهمة التجربة الأولى');await desktop.fill('#acceptance','تظهر على الجهازين');await desktop.click('#send');
 await mobile.getByText('مهمة التجربة الأولى',{exact:true}).waitFor({timeout:15000});
 await mobile.selectOption('#project','trbhh');await mobile.fill('#prompt','مهمة التجربة الثانية');await mobile.click('#send');await mobile.click('#jobs');
 await mobile.getByText(/بانتظار توضيح/).waitFor();await mobile.fill('#acceptance','اختبار ثان');await mobile.getByRole('button',{name:'اعتمد معيار الاختبار المكتوب أدناه'}).click();await mobile.getByText(/في الطابور/).waitFor();
 assert.equal(await mobile.getByText('مهمة التجربة الأولى',{exact:true}).count(),0);
 await desktop.selectOption('#project','trbhh');await desktop.getByText('مهمة التجربة الثانية',{exact:true}).waitFor();
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await mobile.getByRole('button',{name:'نسخ ملخص لـ Claude Code'}).first().click();
 assert.match(await mobile.evaluate(()=>navigator.clipboard.readText()),/مهمة التجربة الثانية/);
 for(const size of [192,512])assert.equal(await mobile.evaluate(async size=>{const i=new Image();i.src='/icon-'+size+'.png';await i.decode();return i.naturalWidth;},size),size);
 await mobile.click('#logout');await mobile.locator('#password').waitFor();
 assert.deepEqual(failures,[]);console.log('PASS real Chromium: two authenticated profiles (1280x810 and 390x844), cross-device sync, project isolation, task clarification, layout, logout, zero CSP/JS errors.');
 }finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>app.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

// AYK-174: isolated static-build UI review. All API data is synthetic; no production writes.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(process.env.AYK_DIST||'client/dist'),out=path.resolve(process.env.AYK_REVIEW_OUT||'docs/ui-review/ayk174');
fs.mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.html':'text/html'};
const server=http.createServer((req,res)=>{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep))p=path.join(root,'index.html');if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));});
const checks=[];const check=(name,ok,details)=>{checks.push({name,ok:Boolean(ok),...(details?{details}: {})});};
const categories=[1,2,99].map(id=>({id,name_ar:id===1?'سباكة':id===2?'كهرباء':'اختبار خطأ',name_en:'Service '+id,slug:'plumbing'}));
const item=(id,c=1)=>({id,category_id:c,title:'طلب تجربة '+id,description:'تفاصيل طلب تجريبي لا تخص أي مستخدم',category_name:'سباكة',city_name:'الرياض',district_name:'حي تجريبي',created_at:new Date().toISOString(),status:'open'});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true});
for(const cfg of [{w:360,h:640,lang:'ar',scale:'m',mode:'light',palette:'brand'},{w:390,h:844,lang:'ar',scale:'xl',mode:'light',palette:'saudi'},{w:768,h:1024,lang:'en',scale:'m',mode:'dark',palette:'sea'},{w:1280,h:800,lang:'en',scale:'m',mode:'light',palette:'desert'},{w:390,h:844,lang:'ar',scale:'m',mode:'light',palette:'brand',contrast:true}]){
const ctx=await browser.newContext({viewport:{width:cfg.w,height:cfg.h}});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(cfg=>{localStorage.setItem('lsm_lang',cfg.lang);localStorage.setItem('ayk_theme_prefs',JSON.stringify(cfg));},cfg);
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();let data=[];
if(u.pathname==='/api/categories')data=categories;
else if(u.pathname==='/api/countries')data=[{id:1,name_ar:'السعودية',name_en:'Saudi Arabia',code:'SA',is_active:1}];
else if(u.pathname==='/api/settings/public')data={};
else if(u.pathname==='/api/stats/public')data={};
else if(u.pathname==='/api/requests/nearby'){let c=u.searchParams.get('category_id');if(c==='99')return route.fulfill({status:500,json:{message:'Fixture error'}});if(c==='1')await new Promise(r=>setTimeout(r,400));data=c?[item(c==='2'?91:81,Number(c))]:Array.from({length:12},(_,i)=>item(i+1));}
return route.fulfill({json:{success:true,data}});});
await page.goto(base,{waitUntil:'networkidle'});const latest=page.getByTestId('latest-requests');await latest.locator('[data-testid="request-card"]').first().waitFor();
const name=engine+' '+cfg.w+' '+cfg.lang+' '+cfg.scale+' '+cfg.mode+' '+cfg.palette+(cfg.contrast?' contrast':'');
check(name+' no overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
check(name+' 12 compact requests',await latest.locator('[data-testid="request-card"]').count()===12);
const geometry=await page.evaluate(()=>{const a=document.querySelector('[data-testid="browse-all-services"]'),b=document.querySelector('[data-testid="home-categories"]');const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),sr=a.querySelector('svg').getBoundingClientRect();return {separate:br.top>=ar.bottom,iconInside:sr.left>=ar.left&&sr.right<=ar.right&&sr.top>=ar.top&&sr.bottom<=ar.bottom};});
check(name+' browse and icon unobstructed',geometry.separate&&geometry.iconInside,geometry);
const colors=await page.evaluate(()=>{const a=document.querySelector('.tone-provider'),b=document.querySelector('.tone-request');return {a:getComputedStyle(a).backgroundImage,b:getComputedStyle(b).backgroundImage,body:getComputedStyle(document.body).backgroundImage,role:getComputedStyle(a).getPropertyValue('--role-color').trim()};});
check(name+' distinct gradients or contrast override',cfg.contrast?colors.a==='none'&&colors.b==='none':colors.a!==colors.b&&colors.a.includes('gradient')&&colors.body.includes('gradient'),colors);
const filter=page.locator('#latest-service-filter');await filter.selectOption('2');await latest.locator('h3').filter({hasText:'91'}).waitFor();check(name+' server filter beyond initial page',await latest.locator('[data-testid="request-card"]').count()===1);
await filter.selectOption('1');await filter.selectOption('2');await page.waitForTimeout(650);check(name+' stale query ignored',(await latest.innerText()).includes('91')&&!(await latest.innerText()).includes('81'));
await filter.selectOption('99');await page.locator('#latest-filter-error').waitFor();check(name+' field error explains failure',await filter.getAttribute('aria-invalid')==='true'&&!!(await page.locator('#latest-filter-error').innerText()));
await filter.selectOption('');await latest.locator('[data-testid="request-card"]').nth(11).waitFor();check(name+' recovers and clears error',await page.locator('#latest-filter-error').count()===0);
check(name+' no runtime errors',errors.length===0,errors);
if(cfg.w===360||cfg.mode==='dark'){await latest.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,engine+'-'+cfg.w+'-'+cfg.mode+'.png')});}
await ctx.close();}await browser.close();}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,passed:checks.filter(x=>x.ok).length,total:checks.length},null,2));console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,failed:checks.filter(x=>!x.ok)}));if(checks.some(x=>!x.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());

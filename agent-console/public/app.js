'use strict';
const $=id=>document.getElementById(id);
let generation=0, pushKey='', signature='', taskSignature='', sending=false, refreshNumber=0;
const statusNames={pending:'في الطابور',running:'قيد التنفيذ','needs-verification':'بانتظار التحقق','needs-approval':'يتطلب موافقة مستقلة','needs-clarification':'بانتظار توضيح',interrupted:'توقف ويحتاج مراجعة',failed:'فشلت المهمة',paused:'معلّقة',blocked:'متوقفة', 'paused-auth':'بانتظار تسجيل الدخول','paused-limit':'بانتظار توفر الاشتراك'};
function status(text){$('status').textContent=text;}
async function api(url,data) {
  const r=await fetch(url,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:data?{'Content-Type':'application/json','X-Agent-Request':'1'}:{},body:data?JSON.stringify(data):undefined});
  const json=await r.json();
  if(!r.ok) throw Object.assign(Error(json.error || 'فشلت العملية'),{status:r.status});
  return json;
}
function hideChat() {
  if ($('handoffDialog').open) $('handoffDialog').close();
  generation++; $('chat').hidden=true; $('logout').hidden=true; $('login').hidden=false;
  $('messages').replaceChildren(); $('tasks').replaceChildren(); $('prompt').value=''; $('acceptance').value='';
  signature=''; taskSignature=''; status('');
}
function element(tag,text,cls) {
  const el=document.createElement(tag);
  if(text) el.textContent=text;
  if(cls) el.className=cls;
  return el;
}
async function refresh() {
  const project=$('project').value, seq=++refreshNumber, g=generation;
  try {
    const query='?project='+encodeURIComponent(project);
    const [data,jobs]=await Promise.all([api('/api/messages'+query),api('/api/jobs'+query)]);
    if(g!==generation || seq!==refreshNumber || project!==$('project').value) return;
    const sig=JSON.stringify(data.messages);
    if(sig!==signature) {
      const root=$('messages'), els=data.messages.map(m=>{
        const box=element('div','',m.role==='user'?'message mine':'message');
        box.append(element('div',m.role==='user'?'أنت':'حالة المهمة','meta'),element('div',m.text));
        return box;
      });
      root.replaceChildren(...(els.length?els:[element('p','اكتب أول طلب لهذا المشروع.','empty')]));
      root.scrollTop=root.scrollHeight; signature=sig;
    }
    const snap=JSON.stringify(jobs.tasks);
    if(snap!==taskSignature) {
      $('tasks').replaceChildren(...jobs.tasks.map(t=>{
        const row=element('div',t.id.slice(0,8)+' · '+(statusNames[t.status] || t.status),'task');
        if(t.message) row.append(element('small',t.message));
        if(t.canResume){
          const retry=element('button','متابعة بعد تفعيل الاشتراك');
          retry.onclick=async()=>{
            try{await api('/api/resume',{id:t.id,project});await refresh();}catch(e){status(e.message);}
          };
          row.append(retry);
        }
        if(t.canClarify){
          const add=element('button','اعتمد معيار الاختبار المكتوب أدناه');
          add.onclick=async()=>{
            try{await api('/api/clarify',{id:t.id,project,acceptance:$('acceptance').value});await refresh();}
            catch(e){status(e.message);}
          };
          row.append(add);
        }
        const handoff=element('button','تسليم إلى Claude Code');
        handoff.className='ghost';
        handoff.onclick=async()=>{
          try{
            const {task}=await api('/api/handoff?project='+encodeURIComponent(project)+'&id='+encodeURIComponent(t.id));
            const note=['تسليم يدوي للمراجعة في Claude Code الرسمي',task.project,task.id,task.status,
              task.text,task.acceptance,task.message,task.checkpoint,'افحص نقطة التوقف قبل التعديل، واختبر النتيجة. النشر يتطلب موافقة مستقلة.'];
            if(project!==$('project').value || $('chat').hidden) return;
            $('handoffText').value=note.filter(Boolean).join('\n');
            $('copyStatus').textContent=''; $('handoffDialog').showModal();
          }catch(e){status(e.message);}
        };
        row.append(handoff);
        return row;
      }));
      if(!jobs.tasks.length) $('tasks').append(element('p','لا توجد مهام لهذا المشروع.'));
      taskSignature=snap;
    }
  } catch(e) {
    if(g!==generation || seq!==refreshNumber) return;
    if(e.status===401) hideChat(); else status('تعذرت المزامنة. ستعاد المحاولة تلقائيًا.');
  }
}
async function enter() {
  const data=await api('/api/projects');
  pushKey=data.pushKey;
  $('project').replaceChildren(...data.projects.map(p=>new Option(p.name,p.id)));
  $('login').hidden=true; $('chat').hidden=false; $('logout').hidden=false;
  await refresh();
}
$('loginForm').onsubmit=async e=>{
  e.preventDefault(); try{
    await api('/api/login',{password:$('password').value}); $('password').value=''; $('loginError').textContent=''; await enter();
  }catch(err){$('loginError').textContent=err.message;}
};
$('sendForm').onsubmit=async e=>{
  e.preventDefault(); if(sending)return;
  sending=true; $('send').disabled=true;
  try{
    const project=$('project').value, text=$('prompt').value.trim(), acceptance=$('acceptance').value.trim();
    const sum=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([text,acceptance])));
    const fingerprint=Array.from(new Uint8Array(sum)).join('.'), key='pending:'+project;
    const old=JSON.parse(sessionStorage.getItem(key) || 'null');
    const id=old?.fingerprint===fingerprint?old.id:crypto.randomUUID();
    sessionStorage.setItem(key,JSON.stringify({id,fingerprint}));
    await api('/api/messages',{id,project,text,acceptance,agent:'codex'});
    sessionStorage.removeItem(key);
    if(project===$('project').value){
      $('prompt').value=''; $('acceptance').value=''; status('حُفظ الطلب. تابع حالته من «متابعة المهام».'); await refresh();
    }
  }catch(err){status(err.message);}
  finally{sending=false;$('send').disabled=false;}
};
$('project').onchange=()=>{
  generation++; signature=''; taskSignature=''; $('messages').replaceChildren(); $('tasks').replaceChildren();
  $('prompt').value=''; $('acceptance').value=''; status(''); refresh();
};
$('jobs').onclick=()=>{
  $('tasks').hidden=!$('tasks').hidden; $('jobs').setAttribute('aria-expanded',String(!$('tasks').hidden)); refresh();
};
$('stores').onclick=async()=>{
  try{await api('/api/stores');status('اتصال Google Play وApp Store غير مفعّل.');}catch(e){status(e.message);}
};
$('notify').onclick=async()=>{
  try{
    if(!('PushManager' in window) || !('Notification' in window)) throw Error('الإشعارات غير متاحة في هذا المتصفح.');
    if(await Notification.requestPermission()!=='granted') throw Error('لم يُمنح إذن الإشعارات.');
    const sw=await navigator.serviceWorker.ready;
    const bytes=Uint8Array.from(atob(pushKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const sub=await sw.pushManager.getSubscription() || await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    await api('/api/notifications',sub.toJSON()); status('سُجِّل هذا الجهاز لتحديثات المهام.');
  }catch(e){status(e.message);}
};
$('copyHandoff').onclick=async()=>{
  try{
    await navigator.clipboard.writeText($('handoffText').value);
    $('copyStatus').textContent='نُسخ الملخص.';
  }catch{
    $('handoffText').focus(); $('handoffText').select();
    $('copyStatus').textContent='انسخ النص المحدد يدويًا.';
  }
};
$('closeHandoff').onclick=()=>$('handoffDialog').close();
$('handoffDialog').onclose=()=>{$('handoffText').value='';};
$('logout').onclick=async()=>{
  try{await api('/api/logout',{});hideChat();}catch(e){status(e.message);}
};
enter().catch(e=>{hideChat();if(e.status!==401)$('loginError').textContent=e.message;});
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
setInterval(()=>{if(!$('chat').hidden)refresh();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('chat').hidden)refresh();});

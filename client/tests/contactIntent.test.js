import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('contact lookup and choice cannot write after route/session invalidation or cancellation',async()=>{
  const scopePath=new URL('../src/utils/contactIntent.js',import.meta.url);
  assert.equal(fs.existsSync(scopePath),true,'contact intents need an explicit lifetime');
  const strip=s=>s.replace(/^import .*;\s*/gm,'').replaceAll('export ','');
  const scope=strip(fs.readFileSync(scopePath,'utf8'));
  const service=strip(fs.readFileSync(new URL('../src/services/requestService.js',import.meta.url),'utf8'));
  for(const mode of ['lookup-route','choice-session','choice-leave-return','cancel']){
    let resolveLookup,resolveChoice,token='session-one',writes=0;
    const window={location:{pathname:'/',search:'',hash:''}};
    const context=vm.createContext({window,AbortController,getToken:()=>token,i18n:{t:k=>k},askChoice:()=>new Promise(r=>{resolveChoice=r;}),api:{get:()=>new Promise(r=>{resolveLookup=r;}),post:async()=>{writes++;return {data:{data:{conversation_id:9}}};}}});
    vm.runInContext(scope+'\n'+service,context);
    const pending=vm.runInContext('contactDirect(2,5)',context);pending.catch(()=>{});
    if(mode==='lookup-route'){window.location.pathname='/directory';vm.runInContext('invalidateContactIntents()',context);}
    resolveLookup({data:{data:[{id:8}]}});
    await new Promise(resolve=>setImmediate(resolve));
    if(mode!=='lookup-route'){
      if(mode==='choice-session'){token='session-two';vm.runInContext('invalidateContactIntents()',context);}
      if(mode==='choice-leave-return'){window.location.pathname='/chat';vm.runInContext('invalidateContactIntents()',context);window.location.pathname='/';}
      resolveChoice(mode==='cancel'?null:'new');
    }
    await assert.rejects(pending,error=>error.cancelled===true,mode);assert.equal(writes,0,mode);
  }
});

test('both request-scoped entry points defer every mutation until a current affirmative choice',async()=>{
  const strip=s=>s.replace(/^import .*;\s*/gm,'').replaceAll('export ','');
  const sources=['../src/utils/contactIntent.js','../src/services/requestService.js','../src/services/chatService.js'].map(p=>strip(fs.readFileSync(new URL(p,import.meta.url),'utf8'))).join('\n');
  for(const call of ['contactRequest(77,2)','createConversation({user_id:2,request_id:77})'])for(const stale of [false,true]){
    let answer;const posts=[];
    const context=vm.createContext({window:{location:{pathname:'/',search:'',hash:''}},AbortController,getToken:()=> 'session-one',i18n:{t:k=>k},askChoice:()=>new Promise(resolve=>{answer=resolve;}),api:{get:async()=>({data:{data:[{id:8}]}}),post:async(path,body,config)=>{posts.push({path,body,config});return {data:{data:{id:9}}};}}});
    vm.runInContext(sources,context);const pending=vm.runInContext(call,context);pending.catch(()=>{});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(posts.length,0);
    if(stale)vm.runInContext('invalidateContactIntents()',context);
    answer('new');
    if(stale){await assert.rejects(pending,error=>error.cancelled);assert.equal(posts.length,0);}
    else{await pending;assert.equal(posts.length,1);assert.equal(posts[0].body.fresh,true);assert.equal(posts[0].config.headers.Authorization,'Bearer session-one');}
  }
});

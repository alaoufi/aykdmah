import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const deletion = fs.readFileSync(new URL('../src/pages/DeleteAccountPage.jsx', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('../src/pages/RegisterPage.jsx', import.meta.url), 'utf8');
const event = { preventDefault() {} };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function deleteHarness(post, logout = async () => {}) {
 const state = { done:false, problem:'', jobs:[], password:'1234', busy:false };
 const context = { user:{id:1}, sure:true, password:'1234', done:false, submission:{current:false}, api:{post}, logout, apiError:e=>e.message };
 context.navigate = (url, options) => { assert.equal(url, '/delete-account'); state.done=options.state.accountDeleted; context.done=state.done; };
 for (const k of Object.keys(state)) context['set'+k[0].toUpperCase()+k.slice(1)] = v => { state[k]=v; context[k]=v; };
 const body = deletion.slice(deletion.indexOf('  const submit ='), deletion.indexOf('\n  return ('));
 return { state, submit:vm.runInNewContext(body+'; submit', context) };
}
test('deletion waits for acknowledgement and coalesces repeated submissions', async () => {
 const pending=deferred(); let calls=0, logouts=0;
 const h=deleteHarness(()=>{calls++;return pending.promise;},async()=>{logouts++;});
 const first=h.submit(event); await h.submit(event);
 assert.equal(calls,1); assert.equal(h.state.done,false);
 pending.resolve({data:{success:true,data:{deleted:true}}}); await first;
 assert.equal(h.state.done,true); assert.equal(h.state.password,''); assert.equal(logouts,1);
 await h.submit(event); assert.equal(calls,1);
});
test('deletion rejects malformed success and permits retry after network failure', async () => {
 let attempt=0;
 const h=deleteHarness(async()=>{ if (++attempt===1) throw new Error('offline'); if(attempt===2)return {data:{success:true,data:{deleted:false}}}; return {data:{success:true,data:{deleted:true}}}; });
 await h.submit(event); assert.equal(h.state.done,false); assert.equal(h.state.busy,false);
 await h.submit(event); assert.equal(h.state.done,false);
 await h.submit(event); assert.equal(h.state.done,true);
});
test('deletion preserves blocking jobs and never logs out on rejected deletion', async () => {
 let logouts=0; const err=Object.assign(new Error('active jobs'),{response:{data:{errors:{jobs:[{id:1,title:'test'}]}}}});
 const h=deleteHarness(async()=>{throw err;},async()=>{logouts++;});
 await h.submit(event); assert.equal(h.state.jobs.length,1); assert.equal(h.state.done,false); assert.equal(logouts,0);
});
test('acknowledged deletion remains successful when logout cleanup fails', async () => {
 const h=deleteHarness(async()=>({data:{success:true,data:{deleted:true}}}),async()=>{throw new Error('offline');});
 await h.submit(event); assert.equal(h.state.done,true); assert.equal(h.state.problem,'');
});
function registerHarness(register, sendPhoneCode=async()=>({required:false})) {
 const state={welcome:null,loading:false,error:''};
 const ctx={submission:{current:false},welcome:null,form:{phone:'0500000000',password:'1234',full_name:'',referral_code:'',role:'client'}, formErrors:()=>({}),cleanPhone:x=>x,codeStep:null,phoneCode:'',place:{},isProvider:false,isValidCoordinates:()=>false,settings:{},register,sendPhoneCode,apiError:e=>e.message,t:x=>x,setFieldErrors(){},setWait(){},setCodeStep:v=>{ctx.codeStep=v;}};
 ctx.from='/requests/new'; ctx.navigate=(url, options)=>{assert.equal(url,'/register');assert.equal(options.state.from,ctx.from);state.welcome=options.state.registrationResult;ctx.welcome=state.welcome;};
 for(const k of Object.keys(state))ctx['set'+k[0].toUpperCase()+k.slice(1)]=v=>{state[k]=v;ctx[k]=v;};
 const body=registration.slice(registration.indexOf('  const handleSubmit ='),registration.indexOf('\n  if (welcome)'));
 return {state,submit:vm.runInNewContext(body+'; handleSubmit',ctx)};
}
test('registration shows success with or without a referral code only after server reply',async()=>{
 for(const code of [undefined,'AB12']){
 const pending=deferred();let calls=0;
 const h=registerHarness(()=>{calls++;return pending.promise;});
 const first=h.submit(event);await Promise.resolve();await h.submit(event);
 assert.equal(calls,1);assert.equal(h.state.welcome,null);
 pending.resolve({user:{role:'client'},referral_code:code});await first;
 assert.equal(h.state.welcome.role,'client');assert.equal(h.state.welcome.code,code);
 await h.submit(event);assert.equal(calls,1);
 }
});
test('registration failure and phone verification do not claim success',async()=>{
 const bad=registerHarness(async()=>{throw new Error('offline');});await bad.submit(event);assert.equal(bad.state.welcome,null);assert.equal(bad.state.loading,false);
 let calls=0;const otp=registerHarness(async()=>{calls++;},async()=>({required:true,length:4}));await otp.submit(event);assert.equal(calls,0);assert.equal(otp.state.welcome,null);assert.equal(otp.state.loading,false);
});

'use strict';
// Persistent background jobs. Runs independently of the browser and HTTP server.
// Disabled unless AGENT_WORKER_ENABLED=1 and AGENT_CLI_ENABLED=1.
// Single-worker design: do not start two instances against the same job directory.
const fs=require('node:fs'),path=require('node:path');
const {executeTask}=require('./runner.cjs');
const root=process.env.AGENT_DATA_DIR||path.join(process.cwd(),'.private-agent-data');
const jobs=path.join(root,'jobs');fs.mkdirSync(jobs,{recursive:true,mode:0o700});
if(process.env.AGENT_WORKER_ENABLED!=='1'||process.env.AGENT_CLI_ENABLED!=='1')throw Error('Worker disabled; opt-in required');
const instances=path.join(root,'worker.lock');
try{fs.mkdirSync(instances,{mode:0o700})}catch{throw Error('Another worker lock exists: confirm stale lock manually before restarting')}
const atomic=(p,obj)=>{const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj),{mode:0o600});fs.renameSync(tmp,p)};
function processOne(){
 const entries=fs.readdirSync(jobs).filter(x=>x.endsWith('.pending.json')).sort();
 if(!entries.length)return false;
 const source=path.join(jobs,entries[0]),running=source.replace('.pending.json','.running.json');
 try{fs.renameSync(source,running)}catch{return false}
 const job=JSON.parse(fs.readFileSync(running,'utf8'));
 const result=running.replace('.running.json','.result.json');
 job.status='running';job.startedAt=new Date().toISOString();atomic(running,job);
 (async()=>{
   try{await executeTask({project:job.project,requested:job.agent,text:job.text,onProgress:state=>{
      job.status=state.status;job.agentUsed=state.agent||job.agent;job.message=state.message||'';
      job.lastOutput=(state.output||'').slice(-3000);job.updatedAt=new Date().toISOString();atomic(running,job);
   }})}catch(e){job.status='failed';job.message=e.message}
   job.finishedAt=new Date().toISOString();atomic(result,job);try{fs.unlinkSync(running)}catch{}
 })().catch(e=>console.error('Worker error',e.message));
 return true;
}
let active=false;const tick=()=>{if(active)return;active=true;try{const working=fs.readdirSync(jobs).some(x=>x.endsWith('.running.json'));if(!working)processOne()}finally{active=false}};
console.log('Background worker started; tasks continue while client devices are off.');
tick();setInterval(tick,4000);
process.on('SIGTERM',()=>{console.log('Worker stopped: running jobs must be reconciled before restart');process.exit(0)});

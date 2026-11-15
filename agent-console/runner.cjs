'use strict';
// Controlled CLI adapter. Only explicit project worktrees, not production directories.
// Subscription CLI login is performed interactively by the operator. No paid API tokens.
const {spawn}=require('node:child_process'), fs=require('node:fs'), path=require('node:path');
function adapterConfig(){
  const enabled=process.env.AGENT_CLI_ENABLED==='1';
  const roots={}; 
  for(const [id,key] of [['aykdmah','AGENT_WORKTREE_AYKDMAH'],['trbhh','AGENT_WORKTREE_TRBHH']]){
    const root=process.env[key];if(root)roots[id]=fs.realpathSync(root);
  }
  return {enabled,roots,timeoutMs:Math.min(900000,Math.max(30000,Number(process.env.AGENT_TASK_TIMEOUT_MS)||600000))};
}
function validateWorktree(root){
  if(!root||!fs.existsSync(path.join(root,'.git')))throw Error('Missing isolated Git worktree; do not point at a live production directory');
  if(root==='/'||root==='/opt'||root==='/root')throw Error('Unsafe worktree root');
}
function run(program,args,cwd,timeoutMs,log){
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd,stdio:['ignore','pipe','pipe'],shell:false,env:{
      PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin',
      HOME:process.env.HOME||'/home/agent',
      LANG:'C.UTF-8',
      TERM:'dumb',
      CI:'1',
      NO_COLOR:'1'
    }});
    let out='',size=0;const max=180000;let timed=false;
    const append=b=>{size+=b.length;if(size<=max)out+=b.toString('utf8');log(out.slice(-2500))};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const timeout=setTimeout(()=>{timed=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),3000).unref()},timeoutMs);
    child.on('error',e=>{clearTimeout(timeout);reject(e)});
    child.on('close',code=>{clearTimeout(timeout);resolve({code,timed,output:out.slice(-12000)})});
  });
}
function isLimit(output){return /(rate.limit|usage.limit|quota.exceeded|limit.reached|try.again.later|weekly.limit|daily.limit|حد الاستخدام|تجاوزت.*الحد)/i.test(output)}
async function executeTask({project,requested,text,onProgress}){
  const cfg=adapterConfig();if(!cfg.enabled)throw Error('CLI execution disabled; configure AGENT_CLI_ENABLED=1 after security review');
  const root=cfg.roots[project];validateWorktree(root);
  const commands={
    codex:{bin:process.env.AGENT_CODEX_BIN||'codex',args:t=>['exec','--sandbox','workspace-write','--skip-git-repo-check',t]},
    claude:{bin:process.env.AGENT_CLAUDE_BIN||'claude',args:t=>['-p',t,'--permission-mode','default']}
  };
  const order=requested==='codex'?['codex','claude']:requested==='claude'?['claude','codex']:/(test|security|review|اختبار|مراجعة|أمان)/i.test(text)?['codex','claude']:['claude','codex'];
  const instruction='Project: '+project+'. Work only inside this isolated worktree. Read AGENTS.md and project documentation first. Do NOT deploy, publish app-store releases, pay, modify production, or access secrets. Avoid destructive commands. Save changes on a task branch and report tests and changes. Request: '+text;
  for(let i=0;i<order.length;i++){
    const name=order[i],c=commands[name];onProgress({status:'running',agent:name,message:'بدأ '+name});
    let r;
    try{r=await run(c.bin,c.args(instruction),root,cfg.timeoutMs,output=>onProgress({status:'running',agent:name,output}))}
    catch(e){onProgress({status:'failed',agent:name,message:'Cannot start CLI: '+e.message});continue}
    if(r.code===0){onProgress({status:'completed',agent:name,output:r.output,message:'CLI completed; verify commits/tests separately'});return}
    if(r.timed){onProgress({status:'failed',agent:name,message:'Timed out; manual review required'});return}
    if(isLimit(r.output)&&i===0){onProgress({status:'handoff',agent:name,message:'Usage limit reported. Trying other tool.'});continue}
    onProgress({status:'failed',agent:name,output:r.output,message:'CLI failed; manual review required'});return
  }
  onProgress({status:'paused',message:'No authenticated/available subscription CLI; no extra charges initiated'})
}
module.exports={executeTask};

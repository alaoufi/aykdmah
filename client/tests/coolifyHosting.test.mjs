import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

test('legacy deploy refuses before invoking Docker or creating environment files under Coolify',{skip:process.platform!=='linux'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'ayk-hosting-'));
 try{
  const deploy=join(dir,'deploy'),bin=join(dir,'bin');mkdirSync(deploy);mkdirSync(join(deploy,'caddy'));mkdirSync(bin);
  writeFileSync(join(deploy,'setup-server.sh'),readFileSync(new URL('../../deploy/setup-server.sh',import.meta.url)));
  writeFileSync(join(deploy,'caddy','Caddyfile'),'aykdmh.com { reverse_proxy 172.18.0.1:8093 }');
  for(const name of ['grep','dirname','date'])symlinkSync('/usr/bin/'+name,join(bin,name));
  const marker=join(dir,'docker-touched');
  writeFileSync(join(bin,'docker'),'#!/bin/bash\nprintf touched > "$AYK_TEST_DOCKER_MARKER"\nexit 1\n',{mode:0o755});
  for(const invocation of [{path:join(deploy,'setup-server.sh'),cwd:dir},{path:'setup-server.sh',cwd:deploy}]){
   const result=spawnSync('/bin/bash',[invocation.path],{cwd:invocation.cwd,env:{...process.env,PATH:bin,AYK_TEST_DOCKER_MARKER:marker},encoding:'utf8'});
   assert.equal(result.status,1);assert.match(result.stderr,/Coolify owns the frontend/);
   assert.equal(existsSync(marker),false);assert.equal(existsSync(join(dir,'.env')),false);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

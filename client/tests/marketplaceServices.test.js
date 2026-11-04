import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('profession defaults affect provider matching without breaking catalog service lookup',async()=>{
  const calls=[];
  const source=fs.readFileSync(new URL('../src/services/serviceService.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const context=vm.createContext({api:{get:async(path,options)=>{calls.push({path,params:options?.params});return {data:{data:[]}};}}});
  vm.runInContext(source,context);
  await vm.runInContext('listServices(3)',context);
  assert.equal(calls[0].params.category_id,3);
  assert.equal(calls[0].params.matching,undefined);
  await vm.runInContext('listMatchingProviders({matching:true})',context);
  assert.equal(calls[1].params.matching,'1');
  await vm.runInContext('listMatchingProviders({matching:false})',context);
  assert.equal(calls[2].params.matching,undefined);
});

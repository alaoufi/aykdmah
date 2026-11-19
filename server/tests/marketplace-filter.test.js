const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('all-requests city selection reaches the model while provider matching stays explicit',async()=>{
  let received;
  const model={pagination:()=>({page:1,limit:20}),findNearby:async q=>{received=q;return {items:[],total:0};},publicView:x=>x};
  const noop=()=>{};
  const context={module:{exports:{}},require:name=>name.endsWith('/Request')?model:name.endsWith('/asyncHandler')?fn=>fn:new Proxy({},{get:()=>noop})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/requestController'),'utf8'),context);
  await context.module.exports.getNearby({query:{city_id:'37',matching:'0'},user:{role:'provider',id:4}},{});
  assert.equal(received.cityId,'37');assert.equal(received.providerId,null);
  await context.module.exports.getNearby({query:{matching:'1'},user:{role:'provider',id:4}},{});
  assert.equal(received.providerId,4);
});

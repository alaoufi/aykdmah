const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('requester default restricts prior professions, retains visible opinion, and all professions stays available',async()=>{
  const rows=[{id:2,category_id:5,service_ids:[],rating_avg:4.8,rating_count:2,opinion:'Great work'},{id:3,category_id:6,service_ids:[],rating_avg:4,rating_count:1}];
  const query=async sql=>sql.includes('SELECT DISTINCT category_id FROM requests')?[{category_id:5}]:sql.includes('SELECT id, category_id FROM services')?[]:sql.includes('FROM cities c')?[{city_name_ar:'مدينة'}]:rows;
  const context={module:{exports:{}},require:name=>name.endsWith('/database')?{query}:name.endsWith('/asyncHandler')?fn=>fn:name.endsWith('/apiResponse')?{success:(_,data)=>data}:name.endsWith('/providerAvailability')?{availability:()=>({state:'available'})}:name.endsWith('/ProviderBadge')?{verifiedPaymentSql:()=> 'TRUE'}:name.endsWith('/subscriptionRules')?{keepAllowed:async rows=>rows}:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/providerMapController'),'utf8'),context);
  const req={query:{city_id:'10',matching:'1'},user:{id:1}};
  const result=await context.module.exports.matching(req,{});
  assert.equal(result.providers.length,1);assert.equal(result.providers[0].id,2);
  assert.equal(result.providers[0].opinion,'Great work');
  req.query.matching='0';assert.equal((await context.module.exports.matching(req,{})).providers.length,2);
});

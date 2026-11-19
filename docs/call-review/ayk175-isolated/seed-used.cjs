const install=require('./server/services/installService'),db=require('./server/config/database'),jwt=require('./server/utils/jwt'),Conversation=require('./server/models/Conversation'),Setting=require('./server/models/Setting');
(async()=>{
 const setup=await install.setupFromEnv(); if(setup.migrations.flatMap(m=>m.errors).length)throw Error('Synthetic migrations failed');
 await Setting.set('verify_block_until_verified',false,'boolean');
 await Setting.set('verify_required_for_provider',''); await Setting.set('verify_required_for_client','');
 const add=async(name,role)=>(await db.query('INSERT INTO users (full_name,email,password_hash,role,is_active) VALUES (?,?,?,?,1)',[name,role+'_'+Math.random().toString(36).slice(2)+'@isolated.invalid','not-a-login-hash',role])).insertId;
 const client=await add('عميل اختبار معزول','client'),provider=await add('مقدم اختبار معزول','provider'),outsider=await add('طرف اختبار خارجي','client');
 const area=await db.queryOne('SELECT id,city_id FROM districts ORDER BY id LIMIT 1');
 const trade=await db.queryOne('SELECT id,category_id FROM services ORDER BY id LIMIT 1');
 await db.query('UPDATE users SET city_id=?,district_id=? WHERE id IN (?,?)',[area.city_id,area.id,client,provider]);
 await db.query('INSERT INTO provider_profiles (user_id,service_ids,category_id) VALUES (?,?,?)',[provider,JSON.stringify([trade.id]),trade.category_id]);
 await db.query('INSERT INTO provider_coverage_districts (user_id,district_id) VALUES (?,?)',[provider,area.id]);
 const request=(await db.query("INSERT INTO requests (client_id,title,description,assigned_provider_id,status,city_id,district_id) VALUES (?,?,?,?,'assigned',?,?)",[client,'طلب اتصال اصطناعي','تحقق وسائط معزول فقط',provider,area.city_id,area.id])).insertId;
 const conv=await Conversation.findOrCreateBetween(client,provider,request);
 const token=(id,role)=>jwt.sign({id,role,auth_version:0,scope:'site',sv:0});
 process.stdout.write(JSON.stringify({conv,client:token(client,'client'),provider:token(provider,'provider'),outsider:token(outsider,'client')})+'\n');
 await db.getPool().end();
})().catch(e=>{console.error(e.message);process.exit(1)});

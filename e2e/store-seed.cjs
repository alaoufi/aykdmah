// Executed via stdin inside the disposable screenshot app, never on production.
const install = require('./server/services/installService');
const db = require('./server/config/database');
const jwt = require('./server/utils/jwt');
const Conversation = require('./server/models/Conversation');
(async () => {
  await install.setupFromEnv();
  const add = async (name, role) => (await db.query(
    'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [name, `${role}@screenshots.invalid`, 'unused', role])).insertId;
  const c = await add('طالب تجريبي', 'client');
  const p = await add('مقدم تجريبي', 'provider');
  const area = (await db.query('SELECT id, city_id FROM districts ORDER BY id LIMIT 1'))[0];
  const trade = (await db.query("SELECT s.id, s.category_id FROM services s JOIN categories k ON k.id=s.category_id WHERE k.slug='electrical' ORDER BY s.id LIMIT 1"))[0];
  if (!area || !trade) throw new Error('Missing geography or electrical fixture');
  await db.query('UPDATE users SET city_id=?, district_id=? WHERE id IN (?,?)', [area.city_id, area.id, c, p]);
  await db.query('INSERT INTO provider_profiles (user_id, service_ids, rating_avg, rating_count) VALUES (?, ?, 4.8, 12)', [p, JSON.stringify([trade.id])]);
  await db.query('INSERT INTO provider_coverage_districts (user_id, district_id) VALUES (?,?)', [p, area.id]);
  const r = (await db.query("INSERT INTO requests (client_id,title,description,assigned_provider_id,status) VALUES (?,?,?,?,'assigned')", [c, 'صيانة الكهرباء', 'فحص وإصلاح الكهرباء المنزلية', p])).insertId;
  const conversation = await Conversation.findOrCreateBetween(c, p, r);
  console.log(JSON.stringify({ conversation, token: jwt.sign({ id: c, role: 'client', auth_version: 0 }) }));
  await db.getPool().end();
})().catch(e => { console.error(e); process.exit(1); });

// Uploads a signed Android bundle to Google Play (AYK-309) with PLAY_SERVICE_ACCOUNT_JSON.
//   node android/play/upload.cjs <file.aab>
// PLAY_TRACK: internal (default) or production. production needs PLAY_CONFIRM to repeat the
// version code ("production <code>"), so a wrong run can never publish: the owner approves it.
// PLAY_NOTES_AR / PLAY_NOTES_EN: «What's new» (Arabic and English).
// The bundle goes into one edit with its track and notes; the edit is committed only if all worked.
const fs = require('fs');
const { API, accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const file = process.argv[2];
  const packageName = process.env.PLAY_PACKAGE || 'sa.aykdmh.app';
  const track = process.env.PLAY_TRACK || 'internal';
  if (!file || !fs.existsSync(file)) throw new Error('usage: upload.cjs <file.aab>');
  if (!['internal', 'production'].includes(track)) throw new Error('PLAY_TRACK must be internal or production');
  const bytes = fs.readFileSync(file);
  const { token, email } = await accessToken();
  console.log(`Signed in as ${email}; uploading ${file} (${bytes.length} bytes) to ${packageName}, track ${track}`);
  await withEdit(token, packageName, async edit => {
    const res = await fetch(`${API.replace('/androidpublisher/v3/applications', '/upload/androidpublisher/v3/applications')}/${packageName}/edits/${edit.id}/bundles?uploadType=media`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: bytes,
    });
    const bundle = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`bundle upload: ${res.status} ${bundle?.error?.message || ''}`);
    const code = bundle.versionCode;
    console.log(`Bundle accepted: version code ${code}`);
    if (track === 'production' && process.env.PLAY_CONFIRM !== `production ${code}`) {
      throw new Error(`production needs PLAY_CONFIRM="production ${code}" (owner's approval); nothing was published`);
    }
    const notes = [['ar', process.env.PLAY_NOTES_AR], ['en-US', process.env.PLAY_NOTES_EN]]
      .filter(([, text]) => text).map(([language, text]) => ({ language, text }));
    await edit.call('PUT', `/tracks/${track}`, { track, releases: [{ versionCodes: [String(code)], status: 'completed', ...(notes.length ? { releaseNotes: notes } : {}) }] });
    console.log(`Release ${code} set on ${track}${notes.length ? ' with notes' : ''}; committing`);
    return true;
  });
  console.log(`DONE: uploaded to ${track}. Google reviews it before it reaches users.`);
})().catch(err => { console.error(`NOT OK: ${err.message}`); process.exit(1); });

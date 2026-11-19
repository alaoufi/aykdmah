// Publishes a version already uploaded to Google Play (AYK-309): the same bundle, not a rebuild, is
// set on production for everyone. Needs PLAY_CONFIRM="production <code>" (the owner's approval).
//   PLAY_VERSION_CODE=19 PLAY_CONFIRM="production 19" node android/play/promote.cjs
const { accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const packageName = process.env.PLAY_PACKAGE || 'sa.aykdmh.app';
  const code = String(process.env.PLAY_VERSION_CODE || '');
  if (!/^\d+$/.test(code)) throw new Error('PLAY_VERSION_CODE must be the version code to publish');
  if (process.env.PLAY_CONFIRM !== `production ${code}`) throw new Error(`PLAY_CONFIRM must be "production ${code}" (owner's approval); nothing was published`);
  const { token, email } = await accessToken();
  console.log(`Signed in as ${email}; publishing version code ${code} of ${packageName} to production`);
  await withEdit(token, packageName, async edit => {
    const { tracks = [] } = await edit.call('GET', '/tracks');
    const uploaded = tracks.some(t => (t.releases || []).some(r => (r.versionCodes || []).includes(code)));
    if (!uploaded) throw new Error(`version code ${code} is on no track: upload it first`);
    const notes = [['ar', process.env.PLAY_NOTES_AR], ['en-US', process.env.PLAY_NOTES_EN]]
      .filter(([, text]) => text).map(([language, text]) => ({ language, text }));
    await edit.call('PUT', '/tracks/production', { track: 'production', releases: [{ versionCodes: [code], status: 'completed', ...(notes.length ? { releaseNotes: notes } : {}) }] });
    console.log(`Version ${code} set on production for everyone; committing`);
    return true;
  });
  console.log('DONE: sent to Google. It reaches users after Google\'s review.');
})().catch(err => { console.error(`NOT OK: ${err.message}`); process.exit(1); });

// AYK-169: screen sharing is not offered; suppress the permission inherited from the SDK.
module.exports = function removeUnusedScreenSharingPermission(manifest) {
  const root = manifest.match(/<manifest\b[^>]*>/);
  if (!root) throw new Error('Android manifest root is missing');
  if (!/xmlns:tools=/.test(root[0])) {
    manifest = manifest.replace(root[0], root[0].replace(/>$/, ' xmlns:tools="http://schemas.android.com/tools">'));
  }
  const pattern = /<uses-permission\b(?=[^>]*android:name=["']android\.permission\.FOREGROUND_SERVICE_MEDIA_PROJECTION["'])[^>]*\/>/g;
  const entries = manifest.match(pattern) || [];
  if (entries.length === 1 && /tools:node="remove"/.test(entries[0])) return manifest;
  manifest = manifest.replace(pattern, '');
  return manifest.replace(/(<manifest\b[^>]*>)/,
    '$1\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" tools:node="remove"/>');
};

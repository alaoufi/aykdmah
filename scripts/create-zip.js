#!/usr/bin/env node
// Reconstructed packaging helper. Git history is packaged separately by the
// recovery handoff; normal source exports exclude local secrets and caches.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = path.join(path.dirname(root), `${path.basename(root)}-source.zip`);
const program = String.raw`
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
blocked = {'.git', '.ssh', '.aws', 'node_modules', 'dist', 'uploads', 'test-results', 'playwright-report', '__pycache__'}
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
 for file in sorted(root.rglob('*')):
  parts = file.relative_to(root).parts
  if any(part in blocked for part in parts) or file.is_symlink() or not file.is_file(): continue
  name = file.name.lower()
  if name.startswith('.env') and name not in {'.env.example', '.env.sample', '.env.template'}: continue
  if name in {'.npmrc', '.netrc', '.ayk-service-accounts.json', 'ayk-admin-access.txt'}: continue
  if file.suffix.lower() in {'.zip', '.tgz', '.log', '.pem', '.key', '.p12', '.pfx', '.dump', '.bak'}: continue
  archive.write(file, pathlib.PurePosixPath(root.name, *parts))
with zipfile.ZipFile(target) as archive:
 if archive.testzip() is not None: raise RuntimeError('ZIP integrity verification failed')
print(str(target))
`;
const result = spawnSync('python3', ['-c', program, root, target], { stdio: 'inherit' });
if (result.error) console.error('Source packaging requires Python 3. No project files were changed.');
process.exitCode = result.status ?? 1;

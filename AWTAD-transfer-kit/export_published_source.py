#!/usr/bin/env python3
"""Read-only export of Awtad's published source via an already signed-in Vercel CLI.

This does not export database rows, service credentials, or Git history.
Only Python's standard library is required. No deployment or migration is run.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import zipfile
from datetime import datetime, timezone

DEPLOYMENT = 'dpl_EobmVg24a2KfZaGUHrLjC5yGfJ9A'
TEAM = 'samialaoufi1408-cmds-projects'
MAX_FILES = 10000
MAX_BYTES = 300 * 1024 * 1024
BLOCKED_DIRS = {'.git', '.vercel', '.ssh', '.aws', 'node_modules', 'uploads',
                'backups', 'dumps', 'exports', 'test-results', 'playwright-report'}
BLOCKED_NAMES = {'.ryza-service-accounts.json', 'ryza-admin-access.txt', '.npmrc', '.netrc'}


class ExportError(Exception):
    pass


def unwrap(value):
    for _ in range(4):
        if isinstance(value, dict) and value.get('truncated'):
            raise ExportError('The API returned truncated data. No complete export can be made.')
        if isinstance(value, dict) and 'result' in value:
            value = value['result']
        else:
            return value
    raise ExportError('Unexpected API response wrapper.')


def api(cli, endpoint):
    try:
        process = subprocess.run([cli, 'api', endpoint, '--method', 'GET', '--scope', TEAM],
                                 capture_output=True, text=True, timeout=180, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise ExportError('Could not run the Vercel CLI. Install it and sign in separately.') from None
    if process.returncode:
        # CLI diagnostics can include account or authentication details.
        raise ExportError('Vercel refused a source read. Check CLI sign-in and project access; no service was changed.')
    decoder = json.JSONDecoder()
    for index, character in enumerate(process.stdout):
        if character not in '[{':
            continue
        try:
            value, end = decoder.raw_decode(process.stdout[index:])
        except ValueError:
            continue
        if process.stdout[index + end:].strip():
            continue
        return unwrap(value)
    raise ExportError('The CLI did not return a complete JSON response.')


def denied(parts):
    for part in parts:
        name = part.lower()
        if name in BLOCKED_DIRS or name in BLOCKED_NAMES:
            return True
        if name.startswith('.env') and name not in {'.env.example', '.env.sample', '.env.template'}:
            return True
        if re.search(r'(^|[._-])(credentials?|service[-_]?accounts?|admin[-_]?access)([._-]|$)', name):
            return True
        if pathlib.PurePosixPath(name).suffix in {'.pem', '.key', '.p12', '.pfx', '.dump', '.bak'}:
            return True
    return False


def collect(tree):
    if not isinstance(tree, list):
        raise ExportError('Expected a deployment file tree.')
    roots = [node for node in tree if isinstance(node, dict) and node.get('name') == 'src']
    if len(roots) != 1 or roots[0].get('type') != 'directory':
        raise ExportError('The uploaded source root is unavailable. Do not substitute compiled output.')
    files, skipped, empty, seen = [], [], [], set()

    def visit(node, parent):
        if not isinstance(node, dict):
            raise ExportError('The file tree is truncated or contains an invalid entry.')
        name = node.get('name')
        if not isinstance(name, str) or name in {'', '.', '..'} or any(c in name for c in '/\\\x00:'):
            raise ExportError('Unsafe source path was rejected.')
        parts = parent + (name,)
        path = '/'.join(parts)
        if denied(parts):
            skipped.append(path)
            return
        kind = node.get('type')
        if kind == 'directory':
            children = node.get('children', [])
            if not isinstance(children, list):
                raise ExportError('Invalid source directory.')
            if not children:
                empty.append(path)
            for child in children:
                visit(child, parts)
        elif kind == 'file':
            uid = node.get('uid')
            if not isinstance(uid, str) or not re.fullmatch('[a-fA-F0-9]{40}', uid) or path in seen:
                raise ExportError('A source file has no valid unique content identifier.')
            seen.add(path)
            files.append((path, uid.lower()))
            if len(files) > MAX_FILES:
                raise ExportError('The source file limit was exceeded.')
        else:
            raise ExportError('Unsupported source entry. Symlinks and build functions are never exported.')

    for node in roots[0].get('children', []):
        visit(node, ())
    if not files or not {'package.json', 'vercel.json'}.issubset(seen):
        raise ExportError('The source tree lacks required project files.')
    return files, skipped, empty


def export(cli, output, archive):
    if output == archive or output in archive.parents:
        raise ExportError('The ZIP must be outside the source directory to avoid archiving itself.')
    if output.exists() or archive.exists():
        raise ExportError('Choose new output paths; existing files will not be replaced.')
    files, skipped, empty = collect(api(cli, f'/v6/deployments/{DEPLOYMENT}/files'))
    output.mkdir(parents=True, exist_ok=False)
    state = {'bytes': 0, 'files': []}
    lock = threading.Lock()

    def download(item):
        path, uid = item
        response = api(cli, f'/v8/deployments/{DEPLOYMENT}/files/{uid}')
        if not isinstance(response, dict) or not isinstance(response.get('data'), str):
            raise ExportError('A file response did not contain base64 source bytes.')
        try:
            data = base64.b64decode(response['data'], validate=True)
        except ValueError:
            raise ExportError('A source file was truncated or corrupt.') from None
        if hashlib.sha1(data).hexdigest() != uid:
            raise ExportError('A source file failed its Vercel content integrity check.')
        with lock:
            state['bytes'] += len(data)
            if state['bytes'] > MAX_BYTES:
                raise ExportError('The source byte limit was exceeded.')
        destination = output.joinpath(*path.split('/'))
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open('xb') as stream:
            stream.write(data)
        with lock:
            state['files'].append({'path': path, 'bytes': len(data), 'sha1': uid,
                                   'sha256': hashlib.sha256(data).hexdigest()})

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(download, files))
        manifest = {
            'kind': 'published-uploaded-source-only', 'deployment_id': DEPLOYMENT,
            'exported_at_utc': datetime.now(timezone.utc).isoformat(),
            'files': sorted(state['files'], key=lambda row: row['path']), 'total_bytes': state['bytes'],
            'excluded_sensitive_paths': sorted(skipped), 'empty_or_unpublished_directories': sorted(empty),
            'warnings': [
                'This is the uploaded source of the named deployment, not the original full development workspace.',
                'Git history and excluded scripts, E2E tests, documentation, and original attachments may be absent.',
                'No database rows, private media, environment values, sessions, or credentials were exported.',
                'Do not run seed, migrations, deployment, or integration tests against the production database.',
            ],
        }
        (output / 'SOURCE-MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as bundle:
            for path in sorted(output.rglob('*')):
                if path.is_file():
                    bundle.write(path, output.name + '/' + path.relative_to(output).as_posix())
    except Exception:
        (output / 'EXPORT-INCOMPLETE.txt').write_text('Export failed. This folder is incomplete; do not use it as a complete source copy.\n', encoding='utf-8')
        if archive.exists():
            archive.unlink()
        raise
    return {'source_files': len(files), 'bytes': state['bytes'], 'archive': str(archive), 'complete_uploaded_source': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cli', default='vercel', help='Path to the separately installed and signed-in Vercel CLI')
    parser.add_argument('--output', default='AWTAD-published-source', help='New output directory')
    parser.add_argument('--zip', dest='archive', default='AWTAD-published-source.zip', help='New ZIP path')
    args = parser.parse_args()
    cli = shutil.which(args.cli)
    if not cli:
        raise ExportError('Vercel CLI is unavailable. Install it and sign in separately first.')
    return export(cli, pathlib.Path(args.output).resolve(), pathlib.Path(args.archive).resolve())


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except ExportError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('Export failed; no complete ZIP was produced. Inspect local files without sharing credentials.', file=sys.stderr)
        sys.exit(1)

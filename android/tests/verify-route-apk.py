"""Verify that a routing-only APK keeps the native codecs and excludes test code."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

baseline, candidate = map(Path, sys.argv[1:3])
with zipfile.ZipFile(baseline) as old, zipfile.ZipFile(candidate) as new:
    libs = sorted(n for n in old.namelist() if n.endswith('.so'))
    assert libs and libs == sorted(n for n in new.namelist() if n.endswith('.so'))
    assert all(hashlib.sha256(old.read(n)).digest() == hashlib.sha256(new.read(n)).digest() for n in libs)
    dex = b''.join(new.read(n) for n in new.namelist() if n.endswith('.dex'))
    assert b'Lsa/aykdmh/app/CallAudioRoute;' in dex
    for forbidden in (b'Lorg/robolectric/', b'Lorg/mockito/', b'Lsa/aykdmh/app/CallAudioRoutingTest;'):
        assert forbidden not in dex
print(json.dumps({'apk': candidate.name, 'bytes': candidate.stat().st_size,
    'sha256': hashlib.sha256(candidate.read_bytes()).hexdigest(),
    'nativeLibrariesMatchBaseline': True, 'nativeLibraryFiles': len(libs),
    'newRoutingClassPresent': True, 'testLibrariesExcluded': True}, indent=2))

"""Publish a tested PR tarball without running PR code in the trusted job."""
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen

PACKAGE = '@observertc/observer-js'
REGISTRY = 'https://registry.npmjs.org'


def next_version(base, versions):
    pattern = re.compile(re.escape(base) + r'-rc\.(0|[1-9][0-9]*)$')
    numbers = [int(match[1]) for version in versions if (match := pattern.fullmatch(version))]
    return f'{base}-rc.{max(numbers, default=0) + 1}'


def next_minor(latest):
    match = re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', latest)
    if not match:
        raise ValueError('npm latest must point to a stable SemVer version')
    return f'{match[1]}.{int(match[2]) + 1}.0'


def registry_metadata():
    request = Request(f'{REGISTRY}/@observertc%2fobserver-js', headers={
        'Accept': 'application/json', 'Cache-Control': 'no-cache',
    })
    # Registry/auth/network errors must fail rather than reset the counter.
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def unpack(archive, destination):
    with tarfile.open(archive, 'r:gz') as package:
        for member in package:
            path = PurePosixPath(member.name)
            if (path.is_absolute() or '..' in path.parts or not path.parts
                    or path.parts[0] != 'package'):
                raise ValueError(f'Invalid package path: {member.name}')
            if not (member.isfile() or member.isdir()):
                raise ValueError(f'Unsupported package entry: {member.name}')
            # Never let PR-provided npm configuration reach the publishing job.
            if path.name == '.npmrc':
                continue
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source:
                    target.write_bytes(source.read())
                target.chmod(member.mode & 0o777)


def publish(artifact_dir):
    archives = list(Path(artifact_dir).glob('*.tgz'))
    if len(archives) != 1:
        raise ValueError('Expected exactly one tested package tarball')
    run = f"{os.environ['SNAPSHOT_RUN_ID']}/{os.environ['SNAPSHOT_RUN_ATTEMPT']}"
    with tempfile.TemporaryDirectory(prefix='observer-snapshot-') as temp:
        unpack(archives[0], Path(temp))
        directory = Path(temp) / 'package'
        manifest_path = directory / 'package.json'
        manifest = json.loads(manifest_path.read_text())
        if manifest['name'] != PACKAGE:
            raise ValueError(f'Expected package {PACKAGE}')
        manifest.pop('scripts', None)
        manifest.pop('publishConfig', None)
        manifest.pop('workspaces', None)
        manifest['repository'] = {
            'type': 'git', 'url': 'git+https://github.com/ObserveRTC/observer-js.git',
        }
        manifest['observerSnapshotRun'] = run
        # Concurrent PRs may read the same next number. Retry only confirmed
        # collisions; authentication, network and other publish errors fail.
        metadata = registry_metadata()
        base = next_minor(metadata['dist-tags']['latest'])
        for attempt in range(10):
            if attempt:
                metadata = registry_metadata()
            versions = metadata['versions']
            existing = next((v for v, data in versions.items()
                             if data.get('observerSnapshotRun') == run), None)
            if existing:
                print(f'Already published {PACKAGE}@{existing}', flush=True)
                return
            version = next_version(base, versions)
            manifest['version'] = version
            manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
            result = subprocess.run([
                'npm', 'publish', '--registry', REGISTRY, '--access', 'public',
                '--ignore-scripts', '--tag', 'snapshot',
            ], cwd=directory, check=False)
            if result.returncode == 0:
                install = f'npm install {PACKAGE}@{version}'
                print(install, flush=True)
                if os.environ.get('GITHUB_STEP_SUMMARY'):
                    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
                        summary.write(f'Published snapshot: `{install}`\n')
                return
            published = registry_metadata()['versions'].get(version)
            if published is not None and published.get('observerSnapshotRun') == run:
                print(f'Confirmed published {PACKAGE}@{version}', flush=True)
                return
            if published is None:
                raise RuntimeError(f'npm publish failed for {version} (exit {result.returncode})')
            time.sleep(min(attempt + 1, 5))
        raise RuntimeError('Too many concurrent snapshot version collisions; re-run this job')


if __name__ == '__main__':
    publish(os.environ['SNAPSHOT_ARTIFACT'])

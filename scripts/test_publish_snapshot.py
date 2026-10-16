import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('publish-snapshot.py'))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


def metadata(versions, latest='1.2.0'):
    return {'dist-tags': {'latest': latest}, 'versions': versions}


class SnapshotTests(unittest.TestCase):
    def test_next_minor_uses_latest_stable_release(self):
        self.assertEqual(snapshot.next_minor('1.2.0'), '1.3.0')
        self.assertEqual(snapshot.next_minor('1.2.9'), '1.3.0')
        self.assertEqual(snapshot.next_minor('1.3.0'), '1.4.0')
        self.assertEqual(snapshot.next_minor('0.99.42'), '0.100.0')
        for invalid in ['1.3.0-beta.1', 'v1.2.0', 'garbage', '01.2.0']:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                snapshot.next_minor(invalid)

    def test_counter_is_per_base_and_numeric(self):
        versions = ['1.3.0-rc.2', '1.3.0-rc.10', '1.4.0-rc.99', '1.3.0-beta.50', '1.3.0']
        self.assertEqual(snapshot.next_version('1.3.0', versions), '1.3.0-rc.11')
        self.assertEqual(snapshot.next_version('2.0.0', versions), '2.0.0-rc.1')

    def archive(self, directory, name='@observertc/observer-js'):
        archive = Path(directory) / 'snapshot.tgz'
        manifest = {
            'name': name, 'version': '1.2.0',
            'scripts': {'prepublishOnly': 'exit 1'},
            'publishConfig': {'registry': 'https://example.invalid'},
        }
        with tarfile.open(archive, 'w:gz') as tar:
            for path, data in [('package/package.json', json.dumps(manifest)),
                               ('package/.npmrc', 'registry=https://example.invalid')]:
                content = data.encode()
                member = tarfile.TarInfo(path)
                member.size = len(content)
                tar.addfile(member, io.BytesIO(content))
        return archive

    def test_publish_retries_collision_and_removes_pr_configuration(self):
        seen = []

        def npm(args, cwd, check):
            manifest = json.loads((cwd / 'package.json').read_text())
            seen.append(manifest['version'])
            self.assertNotIn('scripts', manifest)
            self.assertNotIn('publishConfig', manifest)
            self.assertFalse((cwd / '.npmrc').exists())
            self.assertIn('--ignore-scripts', args)
            self.assertEqual(args[-2:], ['--tag', 'snapshot'])
            return type('Result', (), {'returncode': 1 if len(seen) == 1 else 0})()

        with tempfile.TemporaryDirectory() as temp:
            self.archive(temp)
            with patch.dict('os.environ', {'SNAPSHOT_RUN_ID': '123', 'SNAPSHOT_RUN_ATTEMPT': '1'}), \
                    patch.object(snapshot, 'registry_metadata', side_effect=[
                        metadata({}), metadata({'1.3.0-rc.1': {}}), metadata({'1.3.0-rc.1': {}}),
                    ]), patch.object(snapshot.subprocess, 'run', side_effect=npm), \
                    patch.object(snapshot.time, 'sleep'):
                snapshot.publish(temp)
        self.assertEqual(seen, ['1.3.0-rc.1', '1.3.0-rc.2'])

    def test_already_published_run_is_not_published_again(self):
        with tempfile.TemporaryDirectory() as temp:
            self.archive(temp)
            with patch.dict('os.environ', {'SNAPSHOT_RUN_ID': '123', 'SNAPSHOT_RUN_ATTEMPT': '1'}), \
                    patch.object(snapshot, 'registry_metadata', return_value=metadata({
                        '1.3.0-rc.7': {'observerSnapshotRun': '123/1'},
                    })), patch.object(snapshot.subprocess, 'run') as npm:
                snapshot.publish(temp)
                npm.assert_not_called()

    def test_publish_error_is_not_treated_as_collision(self):
        with tempfile.TemporaryDirectory() as temp:
            self.archive(temp)
            with patch.dict('os.environ', {'SNAPSHOT_RUN_ID': '123', 'SNAPSHOT_RUN_ATTEMPT': '1'}), \
                    patch.object(snapshot, 'registry_metadata', return_value=metadata({})), \
                    patch.object(snapshot.subprocess, 'run', return_value=type('Result', (), {'returncode': 1})()):
                with self.assertRaisesRegex(RuntimeError, 'npm publish failed'):
                    snapshot.publish(temp)

    def test_rejects_path_traversal_and_links(self):
        for name, kind in [('../escape', tarfile.REGTYPE),
                           ('/absolute', tarfile.REGTYPE),
                           ('package/link', tarfile.SYMTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / 'bad.tgz'
                with tarfile.open(archive, 'w:gz') as tar:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = '/tmp'
                    tar.addfile(member)
                with self.assertRaises(ValueError):
                    snapshot.unpack(archive, Path(temp) / 'out')

    def test_wrong_package_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            self.archive(temp, '@other/package')
            with patch.dict('os.environ', {'SNAPSHOT_RUN_ID': '123', 'SNAPSHOT_RUN_ATTEMPT': '1'}):
                with self.assertRaisesRegex(ValueError, 'Expected package'):
                    snapshot.publish(temp)


if __name__ == '__main__':
    unittest.main()

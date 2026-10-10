"""Synthetic artifact checks; no URL ownership, live access or legal approval claims."""

import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from zipfile import ZipFile


REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('package_plugin', REPO / 'scripts/package_plugin.py')
PACKAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGER)
SYNTHETIC_URL = 'https://mcp.publisher-synthetic.org/mcp'


class ReleaseMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.plugin = self.repo / 'plugins/macrosheet'
        shutil.copytree(REPO / 'plugins/macrosheet', self.plugin)

    def complete_synthetic_metadata(self):
        manifest = json.loads((self.plugin / 'plugin.json').read_text())
        compatibility = json.loads((self.plugin / '.codex-plugin/plugin.json').read_text())
        openai = manifest['extensions']['com.openai']
        interface = openai['interface']
        interface['shortDescription'] = 'Synthetic test diary'
        for key in ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']:
            interface[key] = 'https://publisher-synthetic.org/' + key
        interface['logo'] = './assets/logo.svg'
        interface['composerIcon'] = './assets/composer-icon.svg'
        (self.plugin / 'assets').mkdir(exist_ok=True)
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48"/></svg>\n'
        for name in ['logo.svg', 'composer-icon.svg']:
            (self.plugin / 'assets' / name).write_text(svg)
        manifest['license'] = 'SYNTHETIC-TEST-LICENSE'
        compatibility['license'] = manifest['license']
        (self.plugin / 'LICENSE').write_text('Synthetic test fixture; not a license grant.\n')
        openai['review'] = {
            'test_cases': {
                'positive': [{'description': f'Synthetic positive case {i}', 'prompt': 'Render supplied synthetic values.', 'tools_triggered': 'show_dashboard', 'expected_behavior': 'Show supplied values.'} for i in range(5)],
                'negative': [{'description': f'Synthetic negative case {i}', 'prompt': 'Reject incomplete input.'} for i in range(3)]
            },
            'demo_recording_url': 'https://publisher-synthetic.org/walkthrough'
        }
        openai['publication'] = {'release_notes': 'Synthetic metadata validation fixture.'}
        compatibility['interface'] = copy.deepcopy(interface)
        compatibility['extensions']['com.openai'] = {k: copy.deepcopy(v) for k, v in openai.items() if k != 'interface'}
        for name, data in [('plugin.json', manifest), ('.codex-plugin/plugin.json', compatibility)]:
            (self.plugin / name).write_text(json.dumps(data, indent=2) + '\n')

    def payload(self, url=None):
        return PACKAGER.prepare_payload(self.repo, mcp_server_url=url)[3]

    def test_current_candidate_leaves_only_recording_gap_with_explicit_endpoint(self):
        self.assertEqual(PACKAGER.release_issues(self.payload(SYNTHETIC_URL)),
                         ['Review needs an accessible public walkthrough URL'])
        self.assertEqual((REPO / 'LICENSE').read_bytes(),
                         (REPO / 'plugins/macrosheet/LICENSE').read_bytes())
        manifest = json.loads((self.plugin / 'plugin.json').read_text())
        self.assertEqual(manifest['license'], 'AGPL-3.0-only')
        self.assertFalse((self.repo / 'dist').exists())

    def test_incomplete_draft_reports_missing_decisions_without_writing(self):
        manifest = json.loads((self.plugin / 'plugin.json').read_text())
        openai = manifest['extensions']['com.openai']
        for key in ['supportURL', 'privacyPolicyURL', 'termsOfServiceURL']:
            openai['interface'].pop(key, None)
        openai.pop('review', None)
        manifest.pop('license', None)
        (self.plugin / 'LICENSE').unlink(missing_ok=True)
        (self.plugin / 'plugin.json').write_bytes(PACKAGER.json_bytes(manifest))
        PACKAGER.sync_metadata(self.repo)
        issues = PACKAGER.release_issues(self.payload())
        for fragment in ['supportURL', 'privacyPolicyURL', 'termsOfServiceURL', 'LICENSE', 'mcp.json', 'positive', 'negative', 'walkthrough']:
            self.assertTrue(any(fragment in issue for issue in issues), fragment)
        self.assertFalse(any('shortDescription' in issue for issue in issues))
        self.assertFalse(any('square SVG' in issue for issue in issues))
        self.assertFalse((self.repo / 'dist').exists())

    def test_explicit_endpoint_generates_both_configs_only_in_full_archive(self):
        before = (self.plugin / '.codex-plugin/plugin.json').read_bytes()
        path = PACKAGER.build_archive(self.repo, mcp_server_url='https://mcp.example.com/mcp')
        with ZipFile(path) as archive:
            portable = json.loads(archive.read('macrosheet/mcp.json'))
            codex = json.loads(archive.read('macrosheet/.mcp.json'))
            compatibility = json.loads(archive.read('macrosheet/.codex-plugin/plugin.json'))
            self.assertEqual(portable['mcpServers'], {'macrosheet': {'type': 'streamable-http', 'url': 'https://mcp.example.com/mcp'}})
            self.assertEqual(codex['mcpServers'], {'macrosheet': {'url': 'https://mcp.example.com/mcp'}})
            self.assertEqual(compatibility['mcpServers'], './.mcp.json')
            self.assertNotIn('macrosheet/.app.json', archive.namelist())
        self.assertEqual((self.plugin / '.codex-plugin/plugin.json').read_bytes(), before)
        self.assertFalse((self.plugin / 'mcp.json').exists())
        self.assertEqual(PACKAGER.build_archive(self.repo, mcp_server_url='https://mcp.example.com/mcp').read_bytes(), path.read_bytes())
        for mode in ['skill_only', 'presentation_probe']:
            with self.assertRaises(ValueError):
                PACKAGER.build_archive(self.repo, mcp_server_url=SYNTHETIC_URL, **{mode: True})

    def test_complete_synthetic_release_has_allowlisted_assets_and_is_reproducible(self):
        self.complete_synthetic_metadata()
        (self.plugin / 'unrelated-private-config.json').write_text('{}')
        path = PACKAGER.build_archive(self.repo, mcp_server_url=SYNTHETIC_URL, release=True)
        before = path.read_bytes()
        self.assertEqual(PACKAGER.build_archive(self.repo, mcp_server_url=SYNTHETIC_URL, release=True).read_bytes(), before)
        with ZipFile(path) as archive:
            self.assertIn('macrosheet/LICENSE', archive.namelist())
            self.assertIn('macrosheet/assets/logo.svg', archive.namelist())
            self.assertIn('macrosheet/assets/composer-icon.svg', archive.namelist())
            self.assertNotIn('macrosheet/unrelated-private-config.json', archive.namelist())
            files = [(name.removeprefix('macrosheet/'), archive.read(name)) for name in archive.namelist()]
            self.assertEqual(PACKAGER.release_issues(files), [])

    def test_release_failure_preserves_existing_archive_and_rejects_example_endpoint(self):
        path = PACKAGER.build_archive(self.repo)
        before = path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Release artifact checks failed'):
            PACKAGER.build_archive(self.repo, release=True)
        self.assertEqual(path.read_bytes(), before)
        self.complete_synthetic_metadata()
        with self.assertRaisesRegex(ValueError, 'MCP formats'):
            PACKAGER.build_archive(self.repo, mcp_server_url='https://mcp.example.com/mcp', release=True)
        self.assertEqual(path.read_bytes(), before)

    def test_endpoint_rejects_credentials_local_ips_fragments_and_placeholders(self):
        for value in ['http://mcp.example.com/mcp', 'https://user:synthetic@mcp.example.com/mcp', 'https://@mcp.example.com/mcp', 'https://127.0.0.1/mcp', 'https://localhost/mcp', 'https://${MCP_HOST}/mcp', 'https://mcp.example.com/mcp?token=synthetic', 'https://mcp.example.com/mcp#fragment']:
            with self.assertRaises(ValueError, msg=value):
                PACKAGER.build_archive(self.repo, mcp_server_url=value)

    def test_review_case_counts_and_forbidden_fields_are_enforced(self):
        self.complete_synthetic_metadata()
        files = dict(self.payload(SYNTHETIC_URL))
        manifest = json.loads(files['plugin.json'])
        openai = manifest['extensions']['com.openai']
        openai['interface']['shortDescription'] = 'x' * 31
        openai['review']['test_cases']['positive'].pop()
        openai['review']['test_cases']['negative'].append({'description': 'extra', 'prompt': 'extra'})
        openai['review']['test_credentials'] = 'synthetic forbidden field'
        openai['apps'] = './.app.json'
        files['plugin.json'] = json.dumps(manifest).encode()
        issues = PACKAGER.release_issues(list(files.items()))
        for fragment in ['shortDescription', '5 complete positive', '3 complete negative', 'credentials', 'review fields']:
            self.assertTrue(any(fragment in issue for issue in issues), fragment)

    def test_invalid_icons_and_path_escape_are_rejected(self):
        self.complete_synthetic_metadata()
        (self.plugin / 'assets/logo.svg').write_text('<svg viewBox="0 0 24 48"/>')
        self.assertTrue(any('logo' in issue for issue in PACKAGER.release_issues(self.payload(SYNTHETIC_URL))))
        (self.plugin / 'assets/logo.svg').write_text('<svg viewBox="0 0 48 48"><image href="https://example.com/image.png"/></svg>')
        self.assertTrue(any('logo' in issue for issue in PACKAGER.release_issues(self.payload(SYNTHETIC_URL))))
        for value in ['./assets/../../outside.svg', '../outside.svg', '/outside.svg']:
            with self.assertRaises(ValueError):
                PACKAGER.asset_path(value)
        outside = self.repo / 'outside.svg'
        outside.write_text('<svg viewBox="0 0 48 48"/>')
        (self.plugin / 'assets/logo.svg').unlink()
        (self.plugin / 'assets/logo.svg').symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            self.payload(SYNTHETIC_URL)

    def test_mismatched_endpoint_or_identity_is_rejected(self):
        self.complete_synthetic_metadata()
        files = dict(self.payload(SYNTHETIC_URL))
        files['.mcp.json'] = json.dumps({'mcpServers': {'macrosheet': {'url': SYNTHETIC_URL + '/different'}}}).encode()
        manifest = json.loads(files['plugin.json'])
        manifest['author']['name'] = 'Synthetic incorrect publisher'
        files['plugin.json'] = json.dumps(manifest).encode()
        issues = PACKAGER.release_issues(list(files.items()))
        self.assertTrue(any('MCP formats' in issue for issue in issues))
        self.assertTrue(any('Publisher must' in issue for issue in issues))

    def test_claude_release_maps_shared_metadata_without_openai_review_fields(self):
        self.complete_synthetic_metadata()
        manifest = json.loads((self.plugin/'plugin.json').read_text())
        manifest['extensions']['com.openai'].pop('review')
        manifest['extensions']['com.openai'].pop('publication')
        (self.plugin/'plugin.json').write_bytes(PACKAGER.json_bytes(manifest))
        path = PACKAGER.build_archive(self.repo, host='claude', mcp_server_url=SYNTHETIC_URL + '/claude', release=True)
        before = path.read_bytes()
        self.assertEqual(PACKAGER.build_archive(self.repo, host='claude', mcp_server_url=SYNTHETIC_URL + '/claude', release=True).read_bytes(), before)
        with ZipFile(path) as archive:
            files = {name.removeprefix('macrosheet/'): archive.read(name) for name in archive.namelist()}
        self.assertEqual(PACKAGER.release_issues(list(files.items()), 'claude'), [])
        claude = json.loads(files['.claude-plugin/plugin.json'])
        self.assertEqual(claude['license'], manifest['license'])
        for source, target in [('websiteURL', 'homepage'), ('websiteURL', 'documentationUrl'),
                               ('supportURL', 'supportUrl'), ('privacyPolicyURL', 'privacyPolicyUrl'),
                               ('termsOfServiceURL', 'termsOfServiceUrl')]:
            self.assertEqual(claude[target], manifest['extensions']['com.openai']['interface'][source])
        self.assertIn('LICENSE', files)
        self.assertNotIn('extensions', claude)
        for config in [b'{}', b'not json', PACKAGER.json_bytes({'mcpServers': {'macrosheet': {'url': SYNTHETIC_URL}}})]:
            files['.mcp.json'] = config
            self.assertTrue(any('type http' in issue for issue in PACKAGER.release_issues(list(files.items()), 'claude')))
        with self.assertRaisesRegex(ValueError, 'approved HTTPS'):
            PACKAGER.build_archive(self.repo, host='claude', mcp_server_url='https://mcp.example.com/mcp', release=True)
        self.assertEqual(path.read_bytes(), before)

    def test_host_release_paths_are_exact_and_legacy_packages_remain_supported(self):
        self.complete_synthetic_metadata()
        for host in ['openai', 'claude']:
            endpoint = SYNTHETIC_URL + '/' + host
            self.assertEqual(PACKAGER.release_issues(PACKAGER.prepare_payload(
                self.repo, host=host, mcp_server_url=endpoint)[3], host), [])
            for path in ['', '/other', '/claude' if host == 'openai' else '/openai', '/' + host + '/']:
                with self.assertRaisesRegex(ValueError, 'Host release MCP URL must use'):
                    PACKAGER.build_archive(self.repo, host=host, mcp_server_url=SYNTHETIC_URL + path, release=True)
            # Development URLs are used verbatim; release validation never rewrites them.
            files = dict(PACKAGER.prepare_payload(self.repo, host=host, mcp_server_url=SYNTHETIC_URL)[3])
            self.assertEqual(json.loads(files['.mcp.json'])['mcpServers']['macrosheet']['url'], SYNTHETIC_URL)
        self.assertEqual(PACKAGER.release_issues(self.payload(SYNTHETIC_URL)), [])

    def test_claude_draft_reports_its_own_gaps_and_preserves_archive(self):
        manifest = json.loads((self.plugin / 'plugin.json').read_text())
        for key in ['supportURL', 'privacyPolicyURL', 'termsOfServiceURL']:
            manifest['extensions']['com.openai']['interface'].pop(key, None)
        manifest.pop('license', None)
        (self.plugin / 'LICENSE').unlink(missing_ok=True)
        (self.plugin / 'plugin.json').write_bytes(PACKAGER.json_bytes(manifest))
        path = PACKAGER.build_archive(self.repo, host='claude')
        before = path.read_bytes()
        files = PACKAGER.prepare_payload(self.repo, host='claude')[3]
        issues = PACKAGER.release_issues(files, 'claude')
        for fragment in ['supportURL', 'privacyPolicyURL', 'termsOfServiceURL', 'LICENSE', 'type http']:
            self.assertTrue(any(fragment in issue for issue in issues), fragment)
        self.assertFalse(any('positive' in issue or 'onboarding' in issue for issue in issues))
        with self.assertRaisesRegex(ValueError, 'Release artifact checks failed'):
            PACKAGER.build_archive(self.repo, host='claude', release=True)
        self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()

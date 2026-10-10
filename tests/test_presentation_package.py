"""Package boundary checks; host rendering is a separate manual experiment."""

import importlib.util
import hashlib
import json
import posixpath
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from zipfile import ZipFile


REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("package_plugin", REPO / "scripts/package_plugin.py")
PACKAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGER)
PROBE = Path("experiments/macrosheet-presentation-probe")


class PresentationPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        shutil.copytree(REPO / PROBE, self.repo / PROBE)
        shutil.copytree(REPO / "plugins/macrosheet", self.repo / "plugins/macrosheet")

    def test_upload_layout_assets_and_allowlist(self):
        (self.repo / PROBE / "unrelated.txt").write_text("Not distributable")
        path = PACKAGER.build_archive(self.repo, presentation_probe=True)
        self.assertEqual(path.name, "macrosheet-presentation-probe-0.2.0.zip")
        with ZipFile(path) as archive:
            prefix = "macrosheet-presentation-probe/"
            self.assertEqual(archive.namelist(), [prefix + name for name in
                             ["SKILL.md", "assets/dashboard.html", "LICENSE", "LICENSING.md"]])
            for entry in archive.namelist():
                name = entry.removeprefix(prefix)
                source = self.repo / (Path("plugins/macrosheet") if name in ["LICENSE", "LICENSING.md"] else PROBE) / name
                self.assertEqual(archive.read(entry), source.read_bytes())
            skill = archive.read(prefix + "SKILL.md").decode()
            refs = re.findall(r"\]\((assets/[^)]+)\)", skill)
            self.assertEqual(refs, ["assets/dashboard.html"])
            for ref in refs:
                self.assertIn(prefix + ref, archive.namelist())
            html = archive.read(prefix + "assets/dashboard.html").decode()
            snapshot = re.search(r'<script type="application/json" id="snapshot-data">(.*?)</script>', html, re.S)
            self.assertIsNone(json.loads(snapshot[1]), "Upload must not carry tracker data")
            self.assertNotRegex(html, r'\d{4}-\d{2}-\d{2}|docs\.google\.com/spreadsheets/d/')
            archive.extractall(self.repo / "extracted")
        self.assertEqual((self.repo / "extracted" / prefix / "assets/dashboard.html").read_bytes(),
                         (REPO / PROBE / "assets/dashboard.html").read_bytes())

    def test_reproducible_and_independent_of_default_package(self):
        default = PACKAGER.build_archive(self.repo)
        before = default.read_bytes()
        path = PACKAGER.build_archive(self.repo, presentation_probe=True)
        first = path.read_bytes()
        self.assertEqual(PACKAGER.build_archive(self.repo, presentation_probe=True).read_bytes(), first)
        self.assertEqual(default.read_bytes(), before)
        with ZipFile(default) as archive:
            expected = ["plugin.json", ".codex-plugin/plugin.json", "README.md",
                        "skills/macrosheet/SKILL.md", "skills/macrosheet/agents/openai.yaml", "skills/macrosheet/references/tracker-template.md", "skills/macrosheet/references/operations.md",
                        "skills/macrosheet/references/presentation.md", "skills/macrosheet/references/target-help.md", "skills/macrosheet/references/recipes.md", "skills/macrosheet/references/connection-help.md", "skills/macrosheet/assets/tracker-template.json",
                        "LICENSE", "LICENSING.md", "assets/macrosheet-logo.png"]
            self.assertEqual(archive.namelist(), ["macrosheet/" + name for name in expected])
            for name in expected:
                self.assertEqual(archive.read("macrosheet/" + name),
                                 (REPO / "plugins/macrosheet" / name).read_bytes())

    def test_tracking_skill_upload_is_complete_and_data_free(self):
        path = PACKAGER.build_archive(self.repo, skill_only=True)
        self.assertEqual(path.name, "macrosheet-skill-1.6.0.zip")
        before = path.read_bytes()
        self.assertEqual(PACKAGER.build_archive(self.repo, skill_only=True).read_bytes(), before)
        with ZipFile(path) as archive:
            self.assertEqual(archive.namelist(), ["macrosheet/SKILL.md", "macrosheet/agents/openai.yaml", "macrosheet/references/tracker-template.md", "macrosheet/references/operations.md", "macrosheet/references/presentation.md", "macrosheet/references/target-help.md", "macrosheet/references/recipes.md", "macrosheet/references/connection-help.md", "macrosheet/assets/tracker-template.json", "macrosheet/LICENSE", "macrosheet/LICENSING.md"])
            for name in archive.namelist():
                base = name.removeprefix("macrosheet/")
                source = self.repo / "plugins/macrosheet" / base if base in ["LICENSE", "LICENSING.md"] else self.repo / "plugins/macrosheet/skills" / name
                self.assertEqual(archive.read(name), source.read_bytes())
            names=set(archive.namelist())
            for name in names:
                for ref in re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", archive.read(name).decode()):
                    if re.match(r"[a-z]+:",ref):continue
                    self.assertIn(posixpath.normpath(str(Path(name).parent / ref)),names)
            self.assertNotIn("assets/dashboard.html", " ".join(archive.namelist()))
            for name in archive.namelist():
                if name.endswith('.md') and not name.endswith('LICENSING.md'):
                    self.assertNotRegex(archive.read(name).decode().lower(),
                                        r'\b(synthetic|fixture|trial|experiment|legacy|v0|v1|testing)\b|older endpoint|installed-only')
            tracking = ' '.join(archive.read('macrosheet/SKILL.md').decode().split())
            self.assertIn('title is exactly `_MacroSheet`', tracking)
            self.assertIn("name = '_MacroSheet' and mimeType", tracking)
            self.assertIn('Every item, including historical foods, must display numeric', tracking)
            self.assertIn('plain “yes” without an app mention', tracking)
        with self.assertRaises(ValueError):
            PACKAGER.build_archive(self.repo, skill_only=True, presentation_probe=True)

    def test_manifest_starters_match_in_both_host_formats(self):
        root=self.repo / 'plugins/macrosheet'
        portable=json.loads((root/'plugin.json').read_text())
        compatibility=json.loads((root/'.codex-plugin/plugin.json').read_text())
        self.assertEqual(portable['version'],compatibility['version'])
        self.assertIn(f"MacroSheet {portable['version']}:", portable['extensions']['com.openai']['publication']['release_notes'])
        self.assertEqual(portable['extensions']['com.openai']['interface'],compatibility['interface'])
        prompts=compatibility['interface']['defaultPrompt']
        self.assertEqual(len(prompts),3)
        self.assertEqual(len(set(prompts)),3)
        self.assertEqual((root/'.codex-plugin/plugin.json').read_bytes(),
                         PACKAGER.json_bytes(PACKAGER.host_manifest(portable, 'openai')))
        self.assertEqual((root/'skills/macrosheet/agents/openai.yaml').read_bytes(),
                         PACKAGER.openai_skill_metadata(portable))

    def test_host_packages_share_source_bytes_and_have_self_contained_allowlists(self):
        shared = ['skills/macrosheet/SKILL.md', 'skills/macrosheet/references/tracker-template.md', 'skills/macrosheet/references/operations.md',
                  'skills/macrosheet/references/presentation.md', 'skills/macrosheet/references/target-help.md', 'skills/macrosheet/references/recipes.md', 'skills/macrosheet/references/connection-help.md',
                  'skills/macrosheet/assets/tracker-template.json', 'README.md', 'LICENSE', 'LICENSING.md', 'assets/macrosheet-logo.png']
        archives = {}
        (self.repo/'plugins/macrosheet/private-account.json').write_text('{}')
        for host in ['openai', 'claude']:
            endpoint = f'https://mcp.example.com/mcp/{host}'
            path = PACKAGER.build_archive(self.repo, host=host, mcp_server_url=endpoint)
            self.assertEqual(path.name, f'macrosheet-{host}-1.6.0.zip')
            before = path.read_bytes()
            self.assertEqual(PACKAGER.build_archive(self.repo, host=host, mcp_server_url=endpoint).read_bytes(), before)
            with ZipFile(path) as archive:
                archives[host] = {name.removeprefix('macrosheet/'): archive.read(name) for name in archive.namelist()}
                self.assertEqual(len(archive.namelist()), len(archives[host]))
                for name in shared:
                    self.assertEqual(archives[host][name], (self.repo/'plugins/macrosheet'/name).read_bytes())
                presentation = ' '.join(archives[host]['skills/macrosheet/references/presentation.md'].decode().split())
                self.assertIn('Fallbacks state the observed limitation in one sentence', presentation)
                for name, data in archives[host].items():
                    self.assertNotIn(b'/Users/', data)
                    if name.endswith('.md'):
                        for ref in re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)', data.decode()):
                            if re.match(r'[a-z]+:', ref): continue
                            self.assertIn(posixpath.normpath(str(Path(name).parent/ref)), archives[host])
            self.assertEqual(json.loads(archives[host]['.mcp.json'])['mcpServers']['macrosheet']['url'], endpoint)
        for name in shared:
            self.assertEqual(hashlib.sha256(archives['openai'][name]).digest(),
                             hashlib.sha256(archives['claude'][name]).digest())
        self.assertEqual(set(archives['claude']), set(shared + ['.claude-plugin/plugin.json', '.mcp.json']))
        self.assertEqual(set(archives['openai']), set(shared + ['plugin.json', '.codex-plugin/plugin.json',
                         'mcp.json', '.mcp.json', 'skills/macrosheet/agents/openai.yaml', 'assets/macrosheet-logo.png']))
        claude = json.loads(archives['claude']['.claude-plugin/plugin.json'])
        portable = json.loads(archives['openai']['plugin.json'])
        for key in ['name', 'version', 'description', 'author', 'repository', 'license']:
            self.assertEqual(claude[key], portable[key])
        self.assertEqual(claude['icon'], './assets/macrosheet-logo.png')
        self.assertNotIn('extensions', claude)
        self.assertEqual(json.loads(archives['claude']['.mcp.json'])['mcpServers']['macrosheet']['type'], 'http')

    def test_canonical_metadata_drives_all_outputs_and_syncs_source_mirrors(self):
        root = self.repo/'plugins/macrosheet'
        manifest = json.loads((root/'plugin.json').read_text())
        manifest['version'] = '1.0.1'
        manifest['license'] = 'SYNTHETIC-TEST-LICENSE'
        interface = manifest['extensions']['com.openai']['interface']
        interface['shortDescription'] = 'Synthetic diary'
        interface['defaultPrompt'][0] = 'Show my diary.'
        (root/'plugin.json').write_bytes(PACKAGER.json_bytes(manifest))
        (root/'.codex-plugin/plugin.json').write_text('stale source mirror')
        (root/'skills/macrosheet/agents/openai.yaml').write_text('stale source mirror')
        for host in ['openai', 'claude']:
            path = PACKAGER.build_archive(self.repo, host=host)
            self.assertEqual(path.name, f'macrosheet-{host}-1.0.1.zip')
            with ZipFile(path) as archive:
                key = '.codex-plugin/plugin.json' if host == 'openai' else '.claude-plugin/plugin.json'
                self.assertEqual(json.loads(archive.read('macrosheet/'+key))['version'], '1.0.1')
                self.assertEqual(json.loads(archive.read('macrosheet/'+key))['license'], manifest['license'])
                if host == 'openai':
                    self.assertIn(b'Use $macrosheet to show my diary.', archive.read('macrosheet/skills/macrosheet/agents/openai.yaml'))
        PACKAGER.sync_metadata(self.repo)
        self.assertEqual((root/'.codex-plugin/plugin.json').read_bytes(), PACKAGER.json_bytes(PACKAGER.host_manifest(manifest, 'openai')))
        self.assertEqual((root/'skills/macrosheet/agents/openai.yaml').read_bytes(), PACKAGER.openai_skill_metadata(manifest))

    def test_recipe_native_fixture_matches_runtime_format_and_literal_rules(self):
        text = (REPO/'plugins/macrosheet/skills/macrosheet/references/recipes.md').read_text()
        requests = json.loads((REPO/'tests/fixtures/recipe-first-save.json').read_text())
        self.assertTrue(all(len(request) == 1 for request in requests))
        properties = requests[0]['addSheet']['properties']
        self.assertEqual(properties['title'], 'Recipes')
        update = requests[1]['updateCells']
        self.assertEqual(update['start'], {'sheetId': properties['sheetId'], 'rowIndex': 0, 'columnIndex': 0})
        self.assertEqual(update['fields'], 'userEnteredValue')
        headers, record = [row['values'] for row in update['rows']]
        names = [cell['userEnteredValue']['stringValue'] for cell in headers]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(len(record), properties['gridProperties']['columnCount'])
        self.assertIn(' | '.join(names), text)
        self.assertEqual(names[11], 'full_recipe')
        self.assertEqual(names[12], 'notes')
        for cell in headers + record:
            value = cell['userEnteredValue']
            self.assertEqual(len(value), 1)
            self.assertIn(next(iter(value)), {'stringValue', 'numberValue', 'boolValue'})
        self.assertIsInstance(record[10]['userEnteredValue']['boolValue'], bool)
        marker = requests[2]['appendCells']
        self.assertNotEqual(marker['sheetId'], properties['sheetId'])
        self.assertEqual(marker['fields'], 'userEnteredValue')
        self.assertEqual(marker['rows'][0]['values'][0]['userEnteredValue']['stringValue'], 'recipe_schema_version')
        self.assertEqual(marker['rows'][0]['values'][1]['userEnteredValue']['numberValue'], 1)

    def test_source_endpoint_is_shared_and_conflicts_or_credentials_fail(self):
        root = self.repo/'plugins/macrosheet'
        endpoint = 'https://mcp.example.com/mcp'
        (root/'mcp.json').write_bytes(PACKAGER.json_bytes({'mcpServers': {'macrosheet': {'type': 'streamable-http', 'url': endpoint}}}))
        (root/'.mcp.json').write_bytes(PACKAGER.json_bytes({'mcpServers': {'macrosheet': {'url': endpoint}}}))
        for host in ['openai', 'claude']:
            files = dict(PACKAGER.prepare_payload(self.repo, host=host)[3])
            self.assertEqual(json.loads(files['.mcp.json'])['mcpServers']['macrosheet']['url'], endpoint)
        (root/'.mcp.json').write_bytes(PACKAGER.json_bytes({'mcpServers': {'macrosheet': {'url': endpoint+'/different'}}}))
        with self.assertRaisesRegex(ValueError, 'endpoints must agree'):
            PACKAGER.build_archive(self.repo, host='claude')
        PACKAGER.build_archive(self.repo, host='claude', mcp_server_url=endpoint)
        (root/'.mcp.json').unlink()
        for config in [[], {'mcpServers': []}, {'mcpServers': {'macrosheet': []}},
                       {'mcpServers': {'macrosheet': {'url': endpoint, 'headers': {'Authorization': 'synthetic'}}}},
                       {'mcpServers': {'macrosheet': {'url': 'https://user:synthetic@mcp.example.com/mcp'}}}]:
            (root/'mcp.json').write_bytes(PACKAGER.json_bytes(config))
            with self.assertRaises(ValueError):
                PACKAGER.build_archive(self.repo, host='claude')

    def test_invalid_host_modes_and_claude_failure_preserve_archives(self):
        for options in [{'host': 'unknown'}, {'host': 'claude', 'skill_only': True},
                        {'host': 'openai', 'presentation_probe': True}, {'host': 'claude', 'mcp_server_url': ''}]:
            with self.assertRaises(ValueError):
                PACKAGER.build_archive(self.repo, **options)
        path = PACKAGER.build_archive(self.repo, host='claude')
        before = path.read_bytes()
        asset = self.repo/'plugins/macrosheet/skills/macrosheet/assets/tracker-template.json'
        asset.unlink()
        with self.assertRaises(FileNotFoundError):
            PACKAGER.build_archive(self.repo, host='claude')
        self.assertEqual(path.read_bytes(), before)
        outside = self.repo/'private.json'
        outside.write_text('{}')
        asset.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            PACKAGER.build_archive(self.repo, host='claude')
        self.assertEqual(path.read_bytes(), before)

    def test_missing_asset_does_not_replace_existing_archive(self):
        path = PACKAGER.build_archive(self.repo, presentation_probe=True)
        before = path.read_bytes()
        (self.repo / PROBE / "assets/dashboard.html").unlink()
        with self.assertRaises(FileNotFoundError):
            PACKAGER.build_archive(self.repo, presentation_probe=True)
        self.assertEqual(path.read_bytes(), before)

    def test_missing_connection_help_preserves_existing_archives(self):
        modes = [{}, {'skill_only': True}, {'host': 'openai'}, {'host': 'claude'}]
        archives = [PACKAGER.build_archive(self.repo, **mode) for mode in modes]
        before = [archive.read_bytes() for archive in archives]
        (self.repo / 'plugins/macrosheet/skills/macrosheet/references/connection-help.md').unlink()
        for mode, archive, contents in zip(modes, archives, before):
            with self.subTest(mode=mode):
                with self.assertRaises(FileNotFoundError):
                    PACKAGER.build_archive(self.repo, **mode)
                self.assertEqual(archive.read_bytes(), contents)

    def test_licensing_symlinks_cannot_expose_files_in_any_archive(self):
        root = self.repo / 'plugins/macrosheet'
        outside = self.repo / 'private.txt'
        outside.write_text('Synthetic private fixture; must not be packaged.')
        for name in ['LICENSE', 'LICENSING.md']:
            original = (root / name).read_bytes()
            (root / name).unlink()
            (root / name).symlink_to(outside)
            for options in [{}, {'host': 'claude'}, {'skill_only': True}, {'presentation_probe': True}]:
                with self.assertRaisesRegex(ValueError, 'License symlinks', msg=options):
                    PACKAGER.prepare_payload(self.repo, **options)
            (root / name).unlink()
            (root / name).write_bytes(original)


if __name__ == "__main__":
    unittest.main()

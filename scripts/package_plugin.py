"""Build reproducible ZIPs from explicit MacroSheet payload allowlists."""

import argparse
import json
import ipaddress
from pathlib import Path
import re
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zlib
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


def https_url(value, reject_examples=False):
    if not isinstance(value, str) or re.search(r'\s', value):
        return False
    try:
        url = urlsplit(value)
        host = url.hostname
        if url.scheme != 'https' or not host or url.username is not None or url.password is not None or url.fragment:
            return False
        if url.port is not None and not 1 <= url.port <= 65535:
            return False
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', host):
            return False
        try:
            ipaddress.ip_address(host)
            return False  # Release MCP domain verification needs an approved hostname.
        except ValueError:
            pass
        if reject_examples and (host.endswith(('.test', '.invalid', '.localhost', '.example')) or
                                any(host == h or host.endswith('.' + h) for h in ('example.com', 'example.org', 'example.net'))):
            return False
        return True
    except ValueError:
        return False


def asset_path(value):
    if not isinstance(value, str) or not value.startswith('./assets/'):
        raise ValueError('Visual assets must use ./assets/ paths inside the plugin')
    path = Path(value[2:])
    if '..' in path.parts or path.is_absolute():
        raise ValueError('Asset paths must stay inside the plugin')
    return path.as_posix()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def host_manifest(manifest, host):
    result = {k: manifest[k] for k in ['name', 'version', 'description', 'author', 'repository', 'license'] if k in manifest}
    openai = manifest.get('extensions', {}).get('com.openai', {})
    interface = openai.get('interface', {})
    if host == 'openai':
        result['skills'] = './skills/'
        result['interface'] = interface
        result['extensions'] = {'com.openai': {k: v for k, v in openai.items() if k != 'interface'}}
    else:
        for source, target in [('displayName', 'displayName'), ('websiteURL', 'homepage'),
                               ('websiteURL', 'documentationUrl'), ('supportURL', 'supportUrl'),
                               ('privacyPolicyURL', 'privacyPolicyUrl'), ('termsOfServiceURL', 'termsOfServiceUrl'),
                               ('logo', 'icon')]:
            if source in interface:
                result[target] = interface[source]
    return result


def openai_skill_metadata(manifest):
    interface = manifest['extensions']['com.openai']['interface']
    prompts = interface.get('defaultPrompt', [])
    prompt = prompts if isinstance(prompts, str) else prompts[0] if prompts else ''
    prompt = f"Use ${manifest['name']} to {prompt[:1].lower()}{prompt[1:]}"
    return ('interface:\n' + ''.join(
        f'  {key}: {json.dumps(value, ensure_ascii=False)}\n' for key, value in [
            ('display_name', interface['displayName']), ('short_description', interface['shortDescription']),
            ('default_prompt', prompt)]) + 'policy:\n  allow_implicit_invocation: true\n').encode()


def sync_metadata(repo):
    """Refresh source mirrors for direct OpenAI development installs."""
    plugin = repo / 'plugins/macrosheet'
    manifest = json.loads((plugin / 'plugin.json').read_text())
    for name, data in [('.codex-plugin/plugin.json', json_bytes(host_manifest(manifest, 'openai'))),
                       ('skills/macrosheet/agents/openai.yaml', openai_skill_metadata(manifest))]:
        (plugin / name).write_bytes(data)


def release_issues(contents, host=None):
    """Check package artifacts only; live UX, ownership and eligibility are manual gates."""
    if host not in [None, 'openai', 'claude']:
        raise ValueError('Choose host openai or claude')
    required_path = f'/mcp/{host}' if host else None
    host = host or 'openai'
    files = dict(contents)
    manifest = json.loads(files['plugin.json' if host == 'openai' else '.claude-plugin/plugin.json'])
    compatibility = json.loads(files['.codex-plugin/plugin.json']) if host == 'openai' else manifest
    openai = manifest.get('extensions', {}).get('com.openai', {})
    interface = openai.get('interface', {}) if host == 'openai' else {
        target: manifest.get(source) for source, target in [
            ('displayName', 'displayName'), ('homepage', 'websiteURL'), ('supportUrl', 'supportURL'),
            ('privacyPolicyUrl', 'privacyPolicyURL'), ('termsOfServiceUrl', 'termsOfServiceURL'), ('icon', 'logo')]}
    issues = []
    if host == 'openai' and (manifest.get('name'), manifest.get('version'), manifest.get('author'), interface) != (
            compatibility.get('name'), compatibility.get('version'), compatibility.get('author'), compatibility.get('interface')):
        issues.append('Portable and Codex identity/version/publisher/interface must agree')
    if manifest.get('name') != 'macrosheet' or interface.get('displayName') != 'MacroSheet':
        issues.append('Approved plugin and product names must be preserved')
    if manifest.get('author', {}).get('name') != 'PROSPR PTE. LTD.' or (host == 'openai' and interface.get('developerName') != 'PROSPR PTE. LTD.'):
        issues.append('Publisher must be PROSPR PTE. LTD.')
    for key, limit in ([('displayName', 30), ('shortDescription', 30), ('longDescription', 4000), ('developerName', 80)] if host == 'openai' else []):
        value = interface.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > limit or (key == 'shortDescription' and '\n' in value):
            issues.append(f'interface.{key} must be nonempty and within {limit} characters')
    for key in ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']:
        if not https_url(interface.get(key), reject_examples=True):
            issues.append(f'interface.{key} needs an approved public HTTPS URL')
    prompts = interface.get('defaultPrompt', [])
    if isinstance(prompts, str):
        prompts = [prompts]
    if (not isinstance(prompts, list) or len(prompts) > 3 or
            any(not isinstance(p, str) or not p.strip() or len(p) > 128 or '@' in p for p in prompts) or
            len(set(prompts)) != len(prompts)):
        issues.append('Starter prompts must be unique, at most three, within 128 characters and without app mentions')
    if host == 'openai' and (not interface.get('category') or not isinstance(compatibility.get('interface', {}).get('capabilities'), list)):
        issues.append('Category and Codex capabilities are required')
    for key in (['logo', 'composerIcon'] if host == 'openai' else ['logo']):
        try:
            path = asset_path(interface.get(key))
            data = files.get(path)
            if data is None or not 0 < len(data) <= 5 * 1024 * 1024:
                raise ValueError('Missing or oversized icon')
            extension = Path(path).suffix.lower()
            if extension == '.png':
                # shortcut: PNG header checks only; use a full decoder for arbitrary raster uploads.
                if (len(data) < 45 or data[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' or
                        zlib.crc32(data[12:29]) != int.from_bytes(data[29:33], 'big') or
                        not data.endswith(b'\x00\x00\x00\x00IEND\xaeB`\x82')):
                    raise ValueError('PNG header or end chunk is invalid')
                width, height = int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
                if not (width == height and 48 <= width <= 4096):
                    raise ValueError('PNG must be square and 48–4096 pixels')
            elif extension == '.svg':
                if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                    raise ValueError('SVG document entities are not allowed')
                root = ET.fromstring(data)
                if root.tag.split('}')[-1] != 'svg':
                    raise ValueError('Invalid SVG')
                viewbox = [float(n) for n in root.attrib.get('viewBox', '').replace(',', ' ').split()]
                if len(viewbox) == 4:
                    width, height = viewbox[2:]
                else:
                    width, height = float(root.attrib['width']), float(root.attrib['height'])
                if not (width == height and 48 <= width <= 4096):
                    raise ValueError('Icon must be square and at least 48 units')
                if any(node.tag.split('}')[-1] in ['script', 'foreignObject', 'style'] or
                       any(k.split('}')[-1].lower().startswith('on') or
                           (k.split('}')[-1] == 'href' and v and not v.startswith('#')) or
                           ('url(' in v.lower() and not re.fullmatch(r'url\(#[A-Za-z0-9_-]+\)', v))
                           for k, v in node.attrib.items()) for node in root.iter()):
                    raise ValueError('External references or scripts are not allowed')
            else:
                raise ValueError('This release checker supports SVG and PNG branding')
        except (ValueError, TypeError, KeyError, ET.ParseError):
            issues.append(f'interface.{key} needs a packaged square SVG or PNG icon (48–4096 units/pixels, at most 5 MiB); SVG must have no external references')
    if not isinstance(manifest.get('license'), str) or not manifest['license'].strip() or not files.get('LICENSE'):
        issues.append('Approved license identifier and packaged LICENSE are required')
    if host == 'claude':
        try:
            config = json.loads(files['.mcp.json'])
            url = config['mcpServers']['macrosheet']['url']
            if (config != {'mcpServers': {'macrosheet': {'type': 'http', 'url': url}}} or
                    not https_url(url, reject_examples=True) or urlsplit(url).query):
                raise ValueError('Invalid Claude MCP connection')
            if required_path and urlsplit(url).path != required_path:
                issues.append(f'Host release MCP URL must use {required_path}')
        except (KeyError, ValueError, TypeError):
            issues.append('Claude .mcp.json must declare one approved HTTPS macrosheet server with type http')
        return issues
    configs = []
    for name in ['mcp.json', '.mcp.json']:
        try:
            configs.append(json.loads(files[name]))
        except (KeyError, ValueError):
            issues.append(f'{name} must declare the initial hosted MCP connection')
    if len(configs) == 2:
        portable, codex = configs
        expected_schema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
        servers = portable.get('mcpServers', {})
        remote = servers.get('macrosheet', {})
        url = remote.get('url')
        if (portable.get('$schema') != expected_schema or servers != {'macrosheet': {'type': 'streamable-http', 'url': url}} or
                codex != {'mcpServers': {'macrosheet': {'url': url}}} or
                not https_url(url, reject_examples=True) or urlsplit(url).query or compatibility.get('mcpServers') != './.mcp.json'):
            issues.append('Both MCP formats must declare one matching approved HTTPS macrosheet server')
        if required_path and (not isinstance(url, str) or urlsplit(url).path != required_path):
            issues.append(f'Host release MCP URL must use {required_path}')
    onboarding = './skills/macrosheet/SKILL.md'
    if openai.get('onboardingSkill') != onboarding or compatibility.get('extensions', {}).get('com.openai', {}).get('onboardingSkill') != onboarding:
        issues.append('Both formats must declare the packaged onboarding skill')
    for document in [manifest, compatibility]:
        def forbidden(value):
            if isinstance(value, dict):
                return any(k in ['apps', 'hooks', 'test_credentials', 'reviewer_instructions'] or forbidden(v) for k, v in value.items())
            return isinstance(value, list) and any(forbidden(v) for v in value)
        if forbidden(document):
            issues.append('App references, lifecycle hooks and reviewer credentials/instructions cannot ship in this ZIP')
    if '.app.json' in files or any(p.startswith('hooks/') for p in files):
        issues.append('App references and lifecycle hooks cannot ship in this ZIP')
    review = openai.get('review', {})
    cases = review.get('test_cases', {})
    for kind, count in [('positive', 5), ('negative', 3)]:
        entries = cases.get(kind, [])
        fields = ['description', 'prompt', 'tools_triggered', 'expected_behavior'] if kind == 'positive' else ['description', 'prompt']
        if not isinstance(entries, list) or len(entries) != count or any(not isinstance(c, dict) or any(not isinstance(c.get(f), str) or not c[f].strip() for f in fields) for c in entries):
            issues.append(f'Review requires exactly {count} complete {kind} cases with actual tool names where required')
    if not https_url(review.get('demo_recording_url'), reject_examples=True):
        issues.append('Review needs an accessible public walkthrough URL')
    if not openai.get('publication', {}).get('release_notes'):
        issues.append('Publication release notes are required')
    for key in ['review', 'publication']:
        if openai.get(key) != compatibility.get('extensions', {}).get('com.openai', {}).get(key):
            issues.append(f'OpenAI {key} fields must agree across both formats')
    return issues


def connection_url(plugin, explicit):
    """Resolve one endpoint; source files are inputs, never host-specific copies."""
    if explicit is not None:
        url = explicit
    else:
        urls = []
        for name in ['mcp.json', '.mcp.json']:
            source = plugin / name
            if not source.is_file():
                continue
            if not source.resolve().is_relative_to(plugin.resolve()):
                raise ValueError('MCP config symlinks must stay inside the plugin')
            config = json.loads(source.read_text())
            if not isinstance(config, dict) or not isinstance(config.get('mcpServers'), dict):
                raise ValueError('Source MCP config must contain a server map')
            server = config.get('mcpServers', {}).get('macrosheet', {})
            if (not isinstance(server, dict) or set(config) - {'$schema', 'mcpServers'} or
                    set(config.get('mcpServers', {})) != {'macrosheet'} or
                    set(server) - {'url', 'type'} or server.get('type') not in [None, 'http', 'streamable-http']):
                raise ValueError('Source MCP config must contain only the macrosheet HTTP endpoint')
            urls.append(server.get('url'))
        if not urls:
            return None
        if any(url != urls[0] for url in urls):
            raise ValueError('Source MCP endpoints must agree')
        url = urls[0]
    if not https_url(url) or urlsplit(url).query:
        raise ValueError('MCP_SERVER_URL must be an HTTPS URL without credentials, queries, fragments or a local/IP hostname')
    return url


def prepare_payload(repo, presentation_probe=False, skill_only=False, mcp_server_url=None, host=None):
    if host not in [None, 'openai', 'claude']:
        raise ValueError('Choose host openai or claude')
    if presentation_probe and skill_only:
        raise ValueError("Choose one package type")
    if host is not None and (presentation_probe or skill_only):
        raise ValueError('--host is only available in the full plugin package')
    if mcp_server_url is not None and (presentation_probe or skill_only):
        raise ValueError('MCP wiring is only available in the full plugin package')
    if presentation_probe:
        plugin = repo / "experiments" / "macrosheet-presentation-probe"
        version = "0.2.0"
        payload = ["SKILL.md", "assets/dashboard.html"]
    else:
        plugin = repo / "plugins" / "macrosheet"
        manifest = json.loads((plugin / "plugin.json").read_text())
        version = manifest["version"]
        if manifest["name"] != plugin.name or not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise ValueError("Expected the macrosheet plugin and a numeric release version")
        payload = [
            "plugin.json",
            ".codex-plugin/plugin.json",
            "README.md",
            "skills/macrosheet/SKILL.md",
            "skills/macrosheet/agents/openai.yaml",
            "skills/macrosheet/references/tracker-template.md",
            "skills/macrosheet/references/operations.md",
            "skills/macrosheet/references/presentation.md",
            "skills/macrosheet/references/target-help.md",
            "skills/macrosheet/references/recipes.md",
            "skills/macrosheet/references/connection-help.md",
            "skills/macrosheet/assets/tracker-template.json",
        ]
    archive_name = plugin.name
    generated = {}
    if not presentation_probe:
        generated['.codex-plugin/plugin.json'] = json_bytes(host_manifest(manifest, 'openai'))
        generated['skills/macrosheet/agents/openai.yaml'] = openai_skill_metadata(manifest)
    if host == 'claude':
        payload = [name for name in payload if name not in ['plugin.json', '.codex-plugin/plugin.json', 'skills/macrosheet/agents/openai.yaml']]
        payload.insert(0, '.claude-plugin/plugin.json')
        generated['.claude-plugin/plugin.json'] = json_bytes(host_manifest(manifest, 'claude'))
    if host is not None:
        archive_name = f'{plugin.name}-{host}'
    if skill_only:
        plugin = plugin / "skills" / "macrosheet"
        payload = ["SKILL.md", "agents/openai.yaml", "references/tracker-template.md", "references/operations.md", "references/presentation.md", "references/target-help.md", "references/recipes.md", "references/connection-help.md", "assets/tracker-template.json"]
        archive_name = "macrosheet-skill"
        generated = {'agents/openai.yaml': openai_skill_metadata(manifest)}
    # Read the complete allowlisted payload before replacing an existing archive.
    contents = []
    for name in payload:
        if name in generated:
            contents.append((name, generated[name]))
        else:
            source = plugin / name
            if not source.resolve().is_relative_to(plugin.resolve()):
                raise ValueError('Payload symlinks must stay inside the plugin')
            contents.append((name, source.read_bytes()))
    licensing = repo / 'plugins/macrosheet'
    for name in ['LICENSE', 'LICENSING.md']:
        source = licensing / name
        if source.is_file():
            if not source.resolve().is_relative_to(licensing.resolve()):
                raise ValueError('License symlinks must stay inside the plugin')
            contents.append((name, source.read_bytes()))
    if not presentation_probe and not skill_only:
        interface = manifest.get('extensions', {}).get('com.openai', {}).get('interface', {})
        assets = [interface[k] for k in (['logo'] if host == 'claude' else ['logo', 'composerIcon', 'logoDark', 'composerIconDark']) if k in interface]
        if host != 'claude':
            assets += interface.get('screenshots', [])
        for value in sorted(set(assets)):
            name = asset_path(value)
            source = plugin / name
            if not source.resolve().is_relative_to(plugin.resolve()):
                raise ValueError('Asset symlinks must stay inside the plugin')
            contents.append((name, source.read_bytes()))
        url = connection_url(plugin, mcp_server_url)
        if url is not None:
            files = dict(contents)
            if host == 'claude':
                files['.mcp.json'] = json_bytes({'mcpServers': {'macrosheet': {'type': 'http', 'url': url}}})
            else:
                compatibility = json.loads(files['.codex-plugin/plugin.json'])
                compatibility['mcpServers'] = './.mcp.json'
                files['.codex-plugin/plugin.json'] = json_bytes(compatibility)
                files['mcp.json'] = json_bytes({'$schema': 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', 'mcpServers': {'macrosheet': {'type': 'streamable-http', 'url': url}}})
                files['.mcp.json'] = json_bytes({'mcpServers': {'macrosheet': {'url': url}}})
            contents = list(files.items())
    return plugin, version, archive_name, contents


def build_archive(repo, presentation_probe=False, skill_only=False, mcp_server_url=None, release=False, host=None):
    if release and (presentation_probe or skill_only):
        raise ValueError('A public release requires the full plugin package')
    plugin, version, archive_name, contents = prepare_payload(repo, presentation_probe, skill_only, mcp_server_url, host)
    if release:
        issues = release_issues(contents, host)
        if issues:
            raise ValueError('Release artifact checks failed:\n' + '\n'.join('- ' + issue for issue in issues))
    output = repo / "dist" / f"{archive_name}-{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, data in contents:
            entry = ZipInfo(f"{plugin.name}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--skill-only", action="store_true", help="Build the tracking skill upload; MCP is connected separately")
    group.add_argument("--presentation-probe", action="store_true",
                        help="Build the presentation skill and data-free dashboard template")
    group.add_argument('--sync-metadata', action='store_true', help='Regenerate source Codex manifest and OpenAI skill metadata from plugin.json; writes no archive')
    parser.add_argument('--host', choices=['openai', 'claude'], help='Full plugin target; omitted preserves the legacy OpenAI archive name')
    parser.add_argument('--mcp-server-url', help='Use this exact HTTPS endpoint; host releases require /mcp/openai or /mcp/claude, respectively')
    parser.add_argument('--release', action='store_true', help='Refuse to build until public release artifact checks pass; does not establish live UX or eligibility')
    parser.add_argument('--check-release', action='store_true', help='Report release artifact gaps without writing an archive')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    try:
        if args.sync_metadata:
            if args.host or args.mcp_server_url is not None or args.release or args.check_release:
                parser.error('--sync-metadata cannot be combined with package options')
            sync_metadata(repo)
            print('Updated source metadata mirrors from plugins/macrosheet/plugin.json')
            return
        if args.check_release:
            if args.skill_only or args.presentation_probe:
                parser.error('Release checks require the full plugin')
            issues = release_issues(prepare_payload(repo, mcp_server_url=args.mcp_server_url, host=args.host)[3], args.host)
            for issue in issues:
                print('- ' + issue)
            if issues:
                raise SystemExit(1)
            print('PASS: release artifact checks. Live UX, identity/domain ownership and Directory approval remain separate gates.')
            return
        output = build_archive(repo, presentation_probe=args.presentation_probe, skill_only=args.skill_only, mcp_server_url=args.mcp_server_url, release=args.release, host=args.host)
    except ValueError as error:
        parser.error(str(error))
    print(f"Built {output.relative_to(repo)}")


if __name__ == "__main__":
    main()

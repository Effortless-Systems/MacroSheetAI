# MacroSheet

MacroSheet is a conversational meal diary backed by your own Google Sheet.
The tracking skill uses your chat platform’s separately authorized Google tools.
The stateless MCP service calculates supplied nutrition values and renders
Day So Far and Weekly snapshots. It has no Google credentials or nutrition database.

Public website, support and policies: [macrosheet.prospr.me](https://macrosheet.prospr.me/).
This repository contains the distributable software, synthetic tests and build
inputs. Product planning, website management and production account configuration
are maintained separately. Source availability does not imply Directory approval.

## Licensing

[GNU AGPLv3, version 3 only](LICENSE) (`AGPL-3.0-only`) applies except where
separately identified. PROSPR PTE. LTD. offers separate proprietary licensing
under an executed written agreement; see [the licensing notice](plugins/macrosheet/LICENSING.md).
AGPL permits commercial use subject to its conditions. Your meal records,
personal recipes and settings remain yours.

## Tracking

Start with “Help me create my MacroSheet tracker.” Setup validates the sole
`_MacroSheet` tracker using schema 2 and template 2.1.0. Targets are optional.
Newly researched, label-extracted, recipe-derived or estimated meal values require
an itemized portion/nutrition table and explicit confirmation before a write.
Meal logging uses stable IDs, a pending Day So Far before the authorized write,
and a compact receipt after verification from updated cells or targeted readback.
Recipe saves are separate from consumption; ordinary reuse reads summary fields
and stored macros. See the [tracking skill](plugins/macrosheet/skills/macrosheet/SKILL.md)
and [plugin instructions](plugins/macrosheet/README.md).

## Build And Check

Use Python 3 and Node.js 22 or later. Package tooling uses the Python standard
library; presentation dependencies are pinned in its lockfile.

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_tracker_template.mjs tests/test_presentation_data.cjs
npm --prefix apps/presentation ci
npm --prefix apps/presentation run build
npm --prefix apps/presentation test
npm --prefix apps/presentation exec -- playwright install chromium
npm --prefix apps/presentation run test:browser
npm --prefix apps/presentation run test:worker
```

See the [presentation service](apps/presentation/README.md) for local MCP,
configuration and generic deployment instructions. The website is a separate
Worker; the presentation service serves MCP, health and optional domain challenge.
Dashboard usage analytics remains disabled by default. Host installation, Google
persistence, mobile behavior and policy eligibility require separate evidence.

## Package

```sh
python3 scripts/package_plugin.py --sync-metadata
python3 scripts/package_plugin.py --host openai --mcp-server-url "$OPENAI_MCP_SERVER_URL"
python3 scripts/package_plugin.py --host claude --mcp-server-url "$CLAUDE_MCP_SERVER_URL"
python3 scripts/package_plugin.py --host openai --check-release --mcp-server-url "$OPENAI_MCP_SERVER_URL"
```

Host URLs must end exactly in `/mcp/openai` or `/mcp/claude`. Full packages include
the tracking skill and MCP declaration, but Google authorization stays separate.
Use `--release` only after genuine review artifacts are complete; the owner-designated reviewer walkthrough URL is included in the OpenAI candidate.
Actual recording assessment and portal approval remain separate. `--skill-only` and
`--presentation-probe` are development modes. Artifact checks do not prove live
page accessibility, publisher verification, reviewer access or approval.

Root `plugins/macrosheet/plugin.json` owns identity, versions and listing metadata.
The existing packager generates host manifests and skill metadata. Do not hand-edit
mirrors or insert placeholder reviewer URLs. Hosted-guide fallback and existing
confirmation/readback rules remain until installed-host evidence supports a change.

# MacroSheet plugin

Publishing company: PROSPR PTE. LTD.; source remains in the Effortless Systems GitHub
organization. This is an unpublished release candidate. Dashboards are required
for the initial public release. The public ZIP must include this skill and the hosted MCP.

Licensed under [AGPLv3, version 3 only](LICENSE) (`AGPL-3.0-only`). Separate
proprietary licensing is available from PROSPR PTE. LTD. under a written
agreement. See [LICENSING.md](LICENSING.md) for scope, contact and contributor
rights. Your tracker data remains yours.

The repository packager builds OpenAI and Claude archives from the same skill,
references and tracker template. It generates host manifests from the canonical
root `plugin.json`; versions, publisher and public URLs are shared. OpenAI's
archive includes portable/Codex manifests and OpenAI skill metadata. Claude's
archive includes `.claude-plugin/plugin.json` and excludes OpenAI metadata.
Both use the same hosted presentation service and standard MCP Apps widget.

Build with `--host openai` or `--host claude`, and include MCP wiring with
`--mcp-server-url "$MCP_SERVER_URL"`; use the exact approved HTTPS endpoint: `/mcp/openai` for OpenAI or
`/mcp/claude` for Claude. Host release checks require the matching path; the option
never appends it. Existing installations and no-host legacy packages retain `/mcp`.
It generates the archive's MCP configuration (explicit HTTP transport for Claude) without
changing local installation or authorizing Google. Use `--check-release` to
inspect the chosen host's artifact gaps, and `--release` to refuse an incomplete
public package. These commands do not close live release gates.
The directory logo and composer icon use the approved MacroSheet PNG artwork. On 7 October the owner
reported ChatGPT live validation complete. Listing pages, review cases and release
notes are prepared; the public Support page is deployed, and
the owner-selected public review recording URL is included. Reviewer assessment
of the recording and cases remains separate from package validation. The owner approved AGPLv3 with
separate proprietary licensing on 8 October. The existing
`get_tracking_guide` fallback is unchanged. Artifact checks do not establish public
page accessibility, final legal acceptance or policy eligibility.

Version 1.3.0 uses one current tracker/dashboard contract. Usage analytics is
controlled by the service operator and ships disabled. There is no tracker
preference, on/off prompt or analytics tool argument. See the
[privacy policy](https://macrosheet.prospr.me/privacy) for collection status,
fields, purpose and retention.

A guided meal diary for one user in their own Google Sheet. Start with:

> Help me create my MacroSheet tracker. Guide me one step at a time and help me
> choose nutrition targets if I need them.

After agreement, setup creates exactly `_MacroSheet` using the bundled schema 2 /
template 2.1.0 native requests. Later operations reuse the verified account/file ID.
Without a binding, check the exact name `_MacroSheet`; validate and reuse one
candidate, or ask for a choice across multiple candidates. Google reads require
an ID/URL. No family/additional trackers or broad filename searches are supported.
An explicitly linked tracker must validate against the current format. Chat uses
“your tracker”. Targets are optional; the skill can guide
you when you do not know what to choose. Meal receipts stay compact, with automatic
Day So Far after verified saves, corrections and removals for each consumed date and occasional previous-week invitations during active chat.

For new researched, photo/label-extracted, recipe-derived or estimated meal values,
MacroSheet previews kcal/protein/carbs/fat and portions, then explicitly says it
has not logged them and asks whether to log. Exact published values with
estimated=false still require this question; a capability statement is not consent.
For branded items without a usable label, it invites a packaging-label photo
before research and continues without waiting. Readable supplied labels take
priority; later labels revise the pending preview rather than duplicating a meal.
It researches missing branded nutrition before estimating and cites matched
nutrition information. Changed proposals need fresh acceptance; current known
values explicitly supplied by the user and unchanged accepted meal previews stay
direct. No meal is saved from an unconfirmed agent-proposed value.

Save personal recipes in one optional Recipes tab in the existing tracker.
Summary-column reads let the host match loose names/descriptions and reuse stored
macros without downloading full recipe bodies. Ingredient modifications fetch
only the matched recipe and stay ad hoc unless an update/save-as-new is requested.
Recipe saves are separate from consumption and past meal values stay fixed.
See [recipe instructions](skills/macrosheet/references/recipes.md). No paid recipe
API, embeddings, barcode scanner or new Google authorization is added.

For ChatGPT development skill upload, build `macrosheet-skill-<version>.zip` with the repository's
`--skill-only` option. The OpenAI plugin archive includes matching starter prompts
for compatible directory surfaces; its generated `agents/openai.yaml` supplies the skill
onboarding default. The host owns Try in chat and the tested ChatGPT Skills
button currently inserts its own generic demo prompt. Publication and
actual directory routing are separate from building this package.

For Claude development, upload the Claude ZIP through Customize > Plugins,
or extract it for a local Claude Code plugin trial. Enable the appropriate
Google Drive/Sheets connectors and authorize the intended account separately.
Validate native cell/formula metadata, bounded reads, creation/copy, writes and
readback before using tracking operations. No Claude installation, persistence,
inline rendering or mobile support has been verified by local packaging tests.

Installed skill 1.3.0 adds [connection help](skills/macrosheet/references/connection-help.md)
for setup and relevant user-requested/error-driven recovery. If Google access is
missing, optional native Plugin Management discovery can suggest an eligible
uninstalled Google Drive plugin. Already installed/pending/recently suggested
plugins are not suggested again; expired sign-in uses host reconnect controls.
Verify the intended account and required native Sheets operations before resuming.
Absent management tools, unsupported operations or workspace restrictions receive
settings/manual guidance without another backend or a replacement tracker.
Package updates and MCP refresh use supported host controls; management tools
currently expose neither operation. Hosted instructions and fresh dashboard data
keep their existing refresh paths. Recovery preserves confirmations and saved
entry IDs. This reference is installed-only, not a hosted guide topic or public
numeric-tool dependency; its ChatGPT/Claude/mobile behavior remains unverified.

For separate development skill uploads, connect Google and the hosted MCP
endpoint separately. A full preflight package can declare its MCP connection;
Google authorization is still explicit. The skill includes template,
presentation and target-help references. No personal tracker records, endpoint
credentials or account-specific connector IDs are bundled.

The optional renderer shows separate Day So Far and Weekly views. Day So Far uses one daily
aggregate; Weekly loads two weeks for local navigation. An older endpoint can still
show Weekly; Day So Far uses text until the endpoint supports the new schema. The widget
comes from the hosted MCP resource, not an HTML attachment in this ZIP.

The updated renderer handles empty-day and midnight date inputs consistently.
Install the new skill separately: refreshing an MCP connection does not update
its instructions. Live host/mobile verification remains a separate release check.
Local package and browser checks do not prove Google writes or model conversation behavior.

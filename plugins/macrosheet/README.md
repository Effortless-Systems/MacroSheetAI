# MacroSheet

Track meals, save personal recipes and review intake in your own Google Sheet.
MacroSheet uses your chat platform's authorized Google connection. Its hosted
MCP service supplies instructions, numeric calculations and inline dashboards;
it has no Google credentials and cannot save records.

## Setup

Install the MacroSheet package using your host's supported controls and connect
the intended Google account separately. Installation does not grant Google access
or authorize a Sheet write. For connection help, ask MacroSheet in chat.

Start with:

> Help me create my MacroSheet tracker. Guide me one step at a time and help me
> choose nutrition targets if I need them.

Setup creates one personal workbook named `_MacroSheet`, using schema 2 /
template 2.1.0. New workbooks use the bundled native template requests. Targets
are optional. Existing trackers are validated before use; ambiguous matches need
your selection. MacroSheet does not create additional or family trackers.

## Meals, Recipes And Reviews

Newly researched, label-extracted, historical, recipe-derived or estimated meal
values receive an itemized portion/nutrition preview and an explicit save question.
An unchanged accepted preview or current known meal values you explicitly supply
can be saved directly. Changed proposals need fresh confirmation.

Verified meal saves, corrections and removals show Day So Far for each affected
date, with a compact receipt. Weekly shows the requested week and its predecessor.
Text-only requests and unavailable rendering use verified text summaries.
No logged meals means unknown intake, not confirmed zero intake.

Recipes are optional and stay in the same Sheet. Ordinary reuse reads summary
macros; ingredient modifications read only the selected recipe body. Saving a
recipe does not log consumption or change historical meal values.

## Instructions And Privacy

The installed [tracking skill](skills/macrosheet/SKILL.md) and its references own
confirmation, selection, bounded reads and write verification. The hosted
`get_tracking_guide` is generated from those same files, including connection help.
A package update, tool-connection refresh, guide fetch and dashboard data refresh
are separate actions; use the host's supported controls for the first two.

Dashboard usage analytics is controlled by the service operator and is currently
disabled. There is no Sheet preference, on/off chat command or analytics argument.
See the [privacy policy](https://macrosheet.prospr.me/privacy) for collection status,
fields, purpose and retention, or [Support](https://macrosheet.prospr.me/support)
for assistance.

## Licensing

Published by PROSPR PTE. LTD. Licensed under [GNU AGPLv3, version 3 only](LICENSE)
(`AGPL-3.0-only`), except where separately identified. [Source code](https://github.com/Effortless-Systems/MacroSheetAI)
is available at no charge. Separate proprietary licensing is available under a
written agreement; see [LICENSING.md](LICENSING.md). Your tracker data remains yours.

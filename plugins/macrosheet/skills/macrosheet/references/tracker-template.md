# Tracker Template v2

New trackers use schema 2 / template 2.0.0. Existing schema 1 monthly trackers
continue using the raw-read path below. Single-log v0 and unknown versions remain
unsupported. Never migrate, replace or silently repair an existing tracker.

## Copy And Initialize

Prefer a whole-workbook copy of the public, data-free template linked by
`publicTemplateUrl` in [tracker-template.json](../assets/tracker-template.json).
For plugin-only use, fetch `get_tracking_guide(topic="template")` once to obtain
that same static definition. Do not invent a link or use a personal tracker as a
master. Copy using the host Google connector into the selected user's Drive;
never change the master or share the personal copy publicly.

Resolve the single personal tracker first using the main skill: reuse its verified
account/file binding, or check both exact names `_MacroSheet` (canonical) and
`_Macrosheet` (compatibility) before creation. A sole candidate that validates needs no
extra ownership confirmation; multiple candidates need a choice. Other legacy
titles require an explicit binding; never rename an existing file. For a new
copy, verify the new ID differs from the source, the
exact title and owner, private sharing, required tabs/headers, and no copied meal
records or personal settings. Resume an identified incomplete copy after timeout;
never create another blindly. If unexpected data is present, stop instead of
clearing an unknown workbook. No sample meals go into a real tracker.

If the public template is unavailable, create ONE new empty native spreadsheet,
then apply the bundled `baseRequests` with native batchUpdate. These requests
are executable Google Sheets requests, not pseudocode. Fixed sheet IDs are safe
only after confirming they are unused in this new workbook. Remove the original
blank default tab only after adding the template tabs in that same batch; do not
remove an existing user's tab. This fallback still creates exactly schema 2.

Initialize Settings and the current local month's tab/index/summary in one native
batch. Set spreadsheet locale `en_US`, `properties.timeZone` to the chosen IANA
zone (matching Settings), and `autoRecalc=MINUTE`. Locale is a formula-format
contract, not an assumption about the person's location. Resolve fixed IDs by
native metadata, retaining the template's IDs on copy. Verify formula results,
empty log, preferences, native timezone and private ownership before completion.
Use returned complete updated-grid evidence where available. No extra Google
OAuth, Apps Script, service account, trigger or MacroSheet data server is needed.

## Workbook And Settings

Tabs are `Dashboard`, `Settings`, `Month_Index`, `Daily_Summary`, hidden empty
`_Month_Template`, and authoritative `Meals_YYYY_MM` tabs. Derived tabs are
warning-protected, not access controls. Current targets remain optional.

Settings columns A/B are `key` and `value`. EVERY key below is required and unique;
use literal text or native numbers, never formulas.

| key | value |
| --- | --- |
| product | macrosheet |
| schema_version | 2 for new trackers; retain 1 for existing v1 |
| timezone | chosen IANA timezone |
| calorie_target_kcal | accepted number, otherwise blank |
| protein_target_g | accepted number, otherwise blank |
| carbs_target_g | accepted number, otherwise blank |
| fat_target_g | accepted number, otherwise blank |
| person_name | legacy compatibility field; blank on new personal setup, never a tracker-selection rule |
| created_local_date | local creation date, YYYY-MM-DD |
| week_starts_on | chosen integer: 0=Sunday through 6=Saturday |
| last_weekly_review_offer | current local week-start date at setup |
| template_version | 2.0.0 for v2 only |

Ask for intended timezone/week start; do not infer from a UTC clock or invent
targets. Targets are optional finite nonnegative values; explicit zero is not
blank. Week markers are valid local week-start dates, never meal dates.
Missing/duplicate required keys, invalid required settings or unknown versions stop the affected
operation. No default Monday or missing-preference compatibility path exists.

### Optional analytics preference (v1 and v2)

`usage_analytics_enabled` is optional and is not part of the required-key table.
Its value must be a literal native boolean (`boolValue`), never a formula, string
or number. Verified absence means enabled after disclosure. False disables;
malformed, duplicate or unreadable values suppress analytics without blocking
tracking. See [the skill control](../SKILL.md#usage-analytics-preference) for the
notice and immediate conversational opt-out.

Read it with bounded Settings reads. On an explicit change, resolve the unique
key row immediately before writing only that cell with `userEnteredValue.boolValue`
and `fields: "userEnteredValue"`; if verified absent, use an unused Settings row
for only the literal key and boolean. Read back the key/native value; ambiguous
rows must not be overwritten. No migration, template-version bump, notice marker,
meal/recipe/monthly-tab or invitation-state change accompanies this preference.

## Monthly Meal Tabs

Every consumed date belongs only in its matching `Meals_YYYY_MM` tab, e.g.
`2026-09-19` in `Meals_2026_09`. Use consumption time, not logging time.
The header row is:

```text
entry_id | local_date | description | calories_kcal | protein_g | carbs_g | fat_g | estimated | notes
```

- `entry_id`: immutable opaque unique string; generate a UUID once per logical
  save and retain it on retries and date corrections.
- `local_date`: literal ISO `YYYY-MM-DD` text in the tracker timezone.
- `description`: nonempty literal meal/portion text.
- All four nutrition fields: actual numeric cells, finite and nonnegative;
  missing is not zero. Store recorded calories independently of macro calories.
- `estimated`: native boolean, true if any value is estimated. False means
  user/label-supplied, not laboratory accuracy. Notes explain assumptions.
- `notes`: optional literal text under a required header. Never insert user
  content as a formula.

Resolve unique headers and current IDs, not remembered row numbers. Sorting within
a month, extra columns and unrelated tabs are supported. Preserve extra columns
on edits; remove the entire row for an identified deletion. Required meal cells
must be literal. Reject partial nonempty rows, missing/duplicate IDs, invalid
nutrition/dates/booleans, and dates outside the owning month. Do not silently
repair invalid records in required coverage. Renamed canonical tabs or moving a
date across months without moving its whole row are unsupported.

For an existing month, append accepted meal rows in one native `appendCells`
request with `fields: "userEnteredValue"` and the verified numeric sheet ID.
Map headers to their actual columns; supply `stringValue`, `numberValue` and
`boolValue` as appropriate, never a formula for user content or an all-fields
mask. Preserve unknown columns and avoid guessed-row `updateCells` appends.
Do not add a justification field to the native request or save it in meal notes.
The main skill owns accepted scope and failure recovery; this request shape does
not bypass host approval or safety checks.

Before the first write in a month, check current metadata for that tab. If absent,
add it with a fresh unused native sheet ID, headers and requested row in one
supported batch. Never create a tab merely to read. After an uncertain write,
reread metadata and look for the retained entry ID in that month before retrying.
Never create another tab/record blindly. ID checks are scoped to known consumed
month(s); UUIDs avoid normal collisions. This is not an all-history ID audit or
an exactly-once guarantee across chats.

## v2 Month Maintenance

Use the bundled `monthRecipe` and its EXACT formula patterns; do not improvise
formulas. For zero-based slot `s`, the registry row is `s+2` and the 31-row summary
block starts at `31*s+2`, ending 30 rows later. Substitute `__INDEX_ROW__`,
`__SUMMARY_START__`, `__SUMMARY_END__` with those integers. Each month has one
registry row and TEN spilling formulas in its summary block's first row; keep
the other 30 rows empty of user inputs. Calendar padding stays blank.

`Month_Index` columns A:E are literal month, canonical tab name, summary start
row, actual source rowCount and columnCount. F:J are the five formula patterns:
status, meal count, formula-cell count, invalid-row count, duplicate-ID count.
Header lookup is dynamic; extra columns and reordered unique headers are allowed.
Only required meal columns are validated. Formula cells in required columns,
partial rows, malformed dates/types, negative values and duplicates invalidate
that month. An entirely blank row is a gap. Formula status is not an all-history
UUID audit or proof against simultaneous edits.

Before first write in a missing month, get complete metadata, choose an unused
native sheet ID and unused registry slot. Duplicate `_Month_Template` to the
canonical name, unhide it, and include the meal, registry and 31-row summary block
in ONE native batch. Retain the entry ID; after timeout inspect metadata and that
ID before retrying. Create no tabs merely to review an empty/historical period.

There are initially 12 month slots. Beyond that, in the SAME batch append enough
rows to Month_Index and 31 times as many to Daily_Summary. Extend EVERY Dashboard
Daily_Summary lookup range from its verified old bound to `31*capacity+1` using
native formula writes. Keep Dashboard first in the tab bar. Read actual capacities;
never shrink grids or overwrite another month's slot. If a meal append grows a
source grid, or a whole-row deletion reduces it, update that month's A:E bounds
and verified F:J formulas in the same batch. Column-count changes likewise need
updated coverage. Recheck after uncertain writes. A manual expansion outside
coverage disables the fast path until explicitly repaired.

Cross-month corrections include destination creation/registration/capacity when
needed and both months' changed bounds in the single move batch described below.
Do not rewrite unrelated history, current targets or other months. Damaged helpers
are never silently restored during review; use raw reads and explain the fallback.
An explicit repair may regenerate only verified derived areas, preserving meals.

## Verified Summary Reads

The native connector's CellData reads must return BOTH `userEnteredValue` and
`effectiveValue`; formatted display text alone is insufficient. Inspect metadata
once, then batch bounded ranges. Reuse complete current evidence in the same
interaction; Refresh and writes invalidate affected data. Do not cache meals
outside Sheets/chat or persist a second tracker.

1. Read Settings and the finite Month_Index A:E registry, complete canonical tab
   metadata, and selected monthly headers. Require schema 2/template 2.0.0,
   native locale/timezone matching setup, unique valid settings and registry
   identities. Each selected canonical month must have exactly one index row
   whose source row/column bounds equal native metadata. A missing month means no
   logs only if complete metadata proves its canonical tab absent. A present tab
   without a valid index is incomplete, never empty. Match block start to slot;
   reject duplicate/overlapping blocks, unsupported versions and wrong tab names.
2. For selected registered months read and compare F:J **formula inputs** with the exact
   versioned patterns, and the ten summary anchor formulas with their expected
   patterns. Read the small 31x10 summary block for each selected month, including
   input metadata: anchors must match, spill cells must have no entered values,
   all expected calendar dates must appear once, padding must be blank, status
   must be `ok`, counts and numeric/null values must satisfy the snapshot contract.
   Reject native errors, partial spills, formulas replaced by literals, range
   truncation, missing dates and unknown formula revisions. Do not trust an `ok`
   string or stored marker alone. This is at most two selected month blocks for
   the two-week widget. No meal-description/history scan is needed on this path.
3. Select only requested dates from those verified summaries. Prefer direct
   Daily_Summary dates for both current and historical periods; no selector-cell
   write. `Dashboard` already displays today/current/last week and logged-day
   averages. If using its cells, also verify their formulas, date bounds and
   native TODAY against the host's actual local date; otherwise read the daily
   blocks. A midnight/stale TODAY mismatch must never relabel yesterday as today.
4. Send `show_dashboard` **days**, never redundant raw meals: map local_date to
   date, meal_count to mealCount and stored kcal/P/C/F to kcal/protein/carbs/fat.
   Empty days are count 0 with all nutrients null, not zero. Actual zero entries
   remain numeric zero with a positive meal count. Weekly covers exactly 14 dates;
   Today covers one. Future logged records are conflicts, not discarded. Use
   current targets only where the presentation contract permits them. Macro-calorie
   columns are 4/4/9 chart values, never replacements for stored calories.
5. Missing/damaged/stale formulas or coverage disable the summary path. Fall back
   to complete bounded RAW reads below and executed aggregation. Do not silently
   repair formulas or invent totals. Invalid authoritative meal data still blocks
   definitive totals. If read results show a concurrent edit, retry a bounded
   consistent read once, then report uncertainty. Separate connector reads are
   not a transaction or freshness guarantee.

After a verified meal mutation, read the affected summary anchor/block/index in
the native updated-grid response or one batched read, alongside required write
identity evidence. Formula evaluation must have completed. If pending/stale,
retry one bounded read then use verified raw coverage. A changed-row receipt or
MCP render acknowledgement alone proves neither totals nor Google write success.

## Raw Reads For v1 Or Fallback

The Google connector supports multiple bounded native CellData ranges per call.
Row search is substring matching within a bounded scan, not a date-interval query;
its matching-row limit does not establish complete coverage.

1. Establish complete current metadata once: tab inventory and finite bounds.
   Select only months intersecting requested dates. Day So Far needs one month;
   fourteen consecutive days need at most two, including year boundaries. Older
   periods may read more months. Do not scan unrelated history.
2. Batch Settings, headers and small selected monthly logs (up to 200 allocated
   data rows each) in one native read with `userEnteredValue`. Read through bounds,
   including gaps. Validate then filter locally. A missing month in a complete
   valid inventory means no logged rows for that month under this format; a failed
   lookup does not prove absence. Do not create missing tabs during review.
3. For a larger selected month, read its headers and COMPLETE bounded ID/date
   columns first (canonical A/B, resolve reordered headers). Page if necessary.
   Validate literal paired IDs/dates, uniqueness and owning month. Select matching
   rows, merge adjacent row ranges and fetch their required/extra cells in one
   multi-range call where supported, paging without truncation. Check returned
   IDs/dates against the index. A mismatch invalidates the read: retry a bounded
   consistent read once, then explain. No matches after a complete valid index
   means no rows for the dates. This path validates indexed identities and selected
   records, not unrelated nutrition or manually misplaced historical records.
4. Never reuse a data index after writes, sorting, account changes, refresh or
   incomplete coverage. File identity can be reused independently. After a write,
   reread affected date coverage or use complete native updated-grid evidence
   proving it. A changed-row receipt alone is not complete day coverage.

Ranges stay within actual metadata bounds and connector limits. Entirely empty
rows are gaps; partially filled records are invalid. Inspect literal/formula
metadata, not only displayed values. Separate bounded reads are not an atomic
snapshot of collaborative changes. Read-time mismatch or concurrent edits require
recovery, not guessed totals.

## Corrections Across Months

Same-month corrections patch only selected fields and retain the ID. A consumed
date correction crossing months moves the whole entry:

1. Recheck source ID/values, destination headers/bounds and absence of that ID.
   Preserve extra columns by header; stop if their mapping cannot be preserved.
2. Use ONE native Sheets `batchUpdate` to append the full corrected row to the
   destination and delete the source row. Include destination tab creation and
   headers when missing, using an unused known sheet ID. If the connector cannot
   express this batch, report the capability gap before writing. Do not split a
   move into independently successful calls.
3. Verify the ID exactly once at destination and absent at source, with adjacent
   source records preserved. After timeout, check BOTH months before any retry.
   Keep unresolved outcomes uncertain. Show Day So Far for BOTH affected dates
   after verification.

Native batch requests apply together; collaborators can still edit between checks.
This is not a lock, compare-and-swap or cross-chat uniqueness guarantee.

## Deterministic Presentation

For verified v2 summaries prefer aggregate `days`: Google Sheets has already
executed the arithmetic. For v1 or raw fallback prefer numeric `meals` (up to 200)
and let shared JavaScript aggregate; above the limit use an actually executed
calculation, never truncation or mental arithmetic. `calculate_nutrition` remains
available for portion calculations. The MCP has no Google access. Always show
Day So Far after verified save/correct/remove, once per affected consumed date,
with equivalent text only when inline rendering is actually blocked.

## Synthetic Trial

Use only an explicitly identified test tracker with chosen `Asia/Singapore`
timezone. Save two entries on `2026-09-19` in `Meals_2026_09`: (400 kcal, 20 g
protein, 50 g carbs, 13 g fat) and (600, 40, 65, 20). Total: (1000, 60, 115, 33).
Correct the second to (500, 35, 55, 17): total (900, 55, 105, 30). Retry the first
save with its original ID: still two entries. Move the second to `2026-08-31`:
retain its ID in `Meals_2026_08`, absent in September, and render both days.
Remove the first: September 19 has no log, not confirmed zero intake. Review two
weeks across August/September with unsorted rows and gaps; no other month is read.
A month allocated more than 200 data rows exercises the ID/date index path.
Keep trial operations serial. Record lost-write uncertainty and actual connector
call counts separately from local renderer tests.

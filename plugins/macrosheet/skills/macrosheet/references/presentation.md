# Inline intake reviews

Enable the MacroSheet MCP connection declared by the full plugin package, or
connect its supplied HTTPS URL separately when using a skill-only upload.
Uploading this skill does not connect the MCP service or authorize Google.
Discover/load `show_dashboard` and this guide during meal preparation when needed;
retain them for a plain “yes” follow-up without an app mention. Missing renderer
access must not block an otherwise authorized save. Use the version 2 tool
contract below. If it is unavailable, explain the connection blocker and use
verified text fallback.

## Source and identity

Resolve the intended tracker once using the main skill. Retain a conversation-local
mapping from an opaque reference such as `tracker-a` to the verified Sheet/account.
This is not a Sheet ID. Never reuse the reference for another tracker. Widget
follow-ups include trackerRef and snapshotId; resolve their originating call, not
whichever tracker is currently active. If that mapping is lost, request the original tracker link/access; never select
a replacement for the card.
Do not create a tracker because review failed.

Use “Your tracker” for the sole personal workbook, canonically `_MacroSheet`.
Reuse the main skill's verified binding. An explicitly linked personal tracker
must still validate against schema 2 / template 2.1.0. No family-name routing is used.
For a new meal, use its consumed date and a pending view before the write.
After verified corrections/removals or a batch, render once per affected consumed
date, including a backdated day. For a standalone
Day So Far request without a date use the current local date in the tracker's
IANA timezone; a historical day uses the compact daily view with that date. For
Weekly use its saved week start (0=Sunday to 6=Saturday),
loading the requested week and predecessor. Focus on today for the current week,
or the requested week's start for history. An unspecified dashboard means Day So Far.

Read settings and complete relevant coverage through the existing Google
connector. Prefer validated schema 2 summary blocks and their exact formula/coverage
checks in tracker-template.md; damaged summaries use bounded raw reads. Batch bounded native cell ranges, map columns by header, and validate
literal input types, unique IDs, dates, numeric values and estimate flags. Use the
template monthly range/index strategy; only one or two months are needed for
a day or two-week review. Do not turn incomplete search matches into
definitive totals. Reuse complete reads already verified in this interaction when
still current. No duplicate reads solely for the renderer; explicit Refresh always
rereads. A Day So Far payload needs one day, not a fourteen-day prefetch. Follow
the main skill’s pending-view/write/verification sequence for a new meal. Show
verified corrections/removals and batches automatically without an invitation gate.
A formatted Day So Far heading/table is not a substitute for calling the available
renderer. Use v2 `view=today` for the affected consumed date unless text only was
explicitly requested; keep the save receipt concise.

## Pending meal and save status

For normal single-meal logging, send the complete saved baseline in `meals` or
`days` and the addition separately in `pendingMeal.items`. Never include the
addition in both. Resolve duplicates before preparing it. The same call validates,
scales/sums the numeric items and returns combined day totals. The widget says
**“Includes pending meal · save status below.”** Its intake column says “With
pending meal”; it never labels the addition logged. The service does not know
whether the host later saves, cancels or fails.

Use returned `structuredContent.pendingMeal` values for the authorized save;
`structuredContent.day` contains the combined day. Do not wait for a widget
callback. Newly proposed estimates still need the main skill’s full itemized
preview and acceptance. Reuse an unchanged prepared result across acceptance;
a changed proposal needs new calculation/preview and acceptance. Never infer
approval from `accepted=true`: that means only numeric/render input acceptance.

The host verifies the exact saved record/types from sufficient updated grid data
in the native write response, otherwise a targeted readback. Final text beneath
the card confirms the verified save or the actual failure/uncertainty. No routine
second dashboard. After failure, explicitly distinguish the pending projection
from saved totals. The existing card stays an earlier pending snapshot; Refresh
reads saved data and omits pendingMeal. A retry of an already saved meal must not
add it again. A missing-card retry preserves the original pending label unless
fresh verified data is assembled for a separate requested view.

## Usage analytics

The service operator controls usage measurement. No Sheet preference or dashboard
argument controls it. For privacy questions use the main skill's privacy-policy
link. Never add identity, country, IP or manufactured host metadata to arguments.
Analytics failure never permits another save or render retry.

## Tool input version 2

Prefer `days` from verified schema 2 Sheet summaries; native Google formulas
already executed the calculation. For raw fallback prefer verified
numeric meal inputs; shared JavaScript computes aggregates. Other aggregate inputs
require an actually executed calculation, never mental arithmetic.

- `version`: 2; `view`: `today` or `weekly`.
- `weekStartsOn`: saved integer 0 through 6.
- `snapshotId`: UUID for one assembled display snapshot. A refresh, changed view,
  focus date, coverage or source data gets a new UUID. Retry the identical snapshot
  with its existing UUID. Reusing source reads preserves their actual readAt;
  creating a new display snapshot never invents a fresh read time.
- `tracker`: friendly display label, 1–100 characters, no account details. If a
  name is too long for the renderer, agree a shorter display label or use text;
  do not silently truncate or rename the Sheet.
- `trackerRef`: conversation-local reference, 1–64 letters/digits/_/-.
- `timezone`: verified IANA setting. The renderer derives the local date from
  `readAt`; do not substitute a requested historical date for the current date.
- `focusDate`: requested day, no later than today.
- Omit `today` and `periodStart`; both are derived deterministically. Day So Far
  starts on focusDate; Weekly starts seven days before the week containing
  focusDate. Preserve a historical focusDate across midnight. Weekly days must
  cover those exact fourteen dates.
- `readAt`: actual source-read completion timestamp with timezone.
- `targets`: `kcal`, `protein`, `carbs`, `fat` from the four current settings.
  Unset is null; explicit zero stays zero.
- `meals` (preferred for raw reads): complete validated numeric records, each
  with `date`, `kcal`, `protein`, `carbs`, `fat`. Maximum 200, no IDs, descriptions
  or notes. Empty array means complete coverage with no meals. Server and widget
  compute counts/totals and empty days deterministically. Every row must belong
  to the requested period and not be in the future. Never truncate or drop a row.
- `pendingMeal` (optional, `view=today` only): `{items:[{kcal,protein,carbs,fat,multiplier?},...]}`
  for one meal at focusDate. One to 200 numeric items; multiplier is positive and
  at most 1,000,000. Preserve known kcal; null computes missing kcal by 4/4/9 and
  returned `usedMacroEstimate=true` requires estimated status. Macros cannot be
  null. The baseline must exclude this meal. No descriptions, IDs or save flags.
- `days` (preferred for verified schema 2 summaries, never together with meals): one day for Day So Far; exactly fourteen consecutive dates from periodStart
  for Weekly, with focusDate in the second week. Each day has `date`, `mealCount`,
  `kcal`, `protein`, `carbs`, `fat`. Sum recorded values, not macro-derived calories.
  No meals means mealCount 0 and all four values null. Logged meals require numeric
  values, including explicit zeros. Future days have no logged values; report
  conflicting future records instead of dropping them.

Numbers are finite, nonnegative, at most 1,000,000,000; mealCount is an integer up
to 100,000. Reject values beyond the contract rather than clamping/truncating.
Send no extra fields, meal text, row IDs, Sheet links, account IDs or credentials.
The model-visible result returns acceptance and snapshot identity. With a pending
meal it also returns validated `pendingMeal` (kcal/P/C/F, macroKcal and
usedMacroEstimate) and combined `day` (date, mealCount and kcal/P/C/F). These are
numeric facts, not write instructions or evidence of a save. The service also delivers the validated canonical display snapshot
in component-only result metadata.
Acceptance proves neither source correctness nor display.
The server and widget normalize empty-day all-zero/null values to null for v2,
so no meals never implies confirmed zero intake. This does not permit inventing
meal values, ignoring duplicates, or discarding positive values with zero meals.

## Recovery

When relying on hosted guidance, a tool error first triggers the main skill's
single guide refresh. This updates instructions, not Sheet data, and does not
authorize another save or override the bounded action recovery below.

- Tool not yet loaded: search/load `show_dashboard` once. Missing in the current
  tool list or an earlier assistant's claim is not proof it is unavailable.
  If discovery or access actually fails, name that capability blocker and use text.
- Input validation error: use its field path and message to correct the snapshot
  from existing verified evidence, then retry ONCE. Do not reread Sheets merely
  to fix dates, coverage assembly or empty-day representation. Do not retry an
  unchanged payload or remove positive nutrition to force acceptance. If source
  evidence is incomplete or conflicting, explain that limitation instead.
  If the corrected attempt still fails, explain the unresolved input error and
  use verified text values; do not retry again.
- Transport/service error: say the dashboard connection failed and use text;
  do not describe this as a Google read failure or create a replacement tracker.
- Accepted result: complete authorization and write verification before reporting
  a saved meal; then keep the meal receipt compact without repeating daily totals
  (one short paragraph with the saved meal's portion, date, kcal/P/C/F and estimate
  status, not another daily-total table, metrics block or recap)
  or announcing “display unconfirmed” solely because the host UI cannot be inspected.
  Do not claim the card appeared. An accepted result is not evidence of failure.
- User reports a missing card: acknowledge that report and permit one presentation
  retry from still-current complete evidence, retaining snapshot identity/readAt.
  Refresh the source only if stale or explicitly requested. If the card remains
  missing, explain that observed limitation and provide verified text; do not loop.

Text fallback is only for an observed error, unsupported host, reported missing
card or explicit text-only request. Fallbacks state the observed limitation in
one sentence (no error explanation is needed for text-only preference) and contain equivalent
verified daily rows or a weekly table with coverage. A pending projection must
retain its pending label and explicit save status, including in text. Incomplete source coverage
gets a limitation, not guessed full-day totals. No HTML attachment, retry loop,
generated substitute widget or repeated save because rendering failed.

## Follow-ups

Loaded-week navigation is local. Unloaded weeks request chat; reuse current complete
coverage or read missing data, then show Weekly. View Day So Far/weekly switches are
explicit requests for separate views with new snapshot IDs. An earlier card remains a snapshot, with its
read time. A new view can be a new card; never claim an old card was refreshed.

Refresh always rereads the resolved tracker, current settings and requested period,
updating readAt, today and snapshotId. For Day So Far preserve the selected consumed date on refresh, including a
backdated meal. An explicit request for today switches to the current local date. For Weekly
preserve the requested week and current preference alignment. On failure report
that the previous card remains an earlier snapshot.

Set target offers either an explicit value or guidance. Need help setting targets?
and Review targets use [target-help.md](target-help.md) in chat; button clicks do
not accept a proposal. Verify accepted target writes, then offer Day So Far; meal logging follows the
pending-view sequence above. Show today's meals
uses validated diary data in chat; it needs no render call or expanded server payload.
Unsupported widget messaging supplies a manual prompt with the same binding rules.

# Development Skills

Use the shared user-level skills in `$HOME/.agents/skills`:

- `mcp-plugin-dev-plan` for MCP/plugin design and implementation planning.
- `mcp-plugin-dev-implement` for authorized implementation and verification.

These reusable workflows take MacroSheet-specific requirements from this file,
the bundled tracking references, tests, and current source. Read `PRODUCT.md` and
`DESIGN.md` when present and relevant. Do not depend on another project's
checkout for skills or copy the shared skills into this repository.

The distributable tracking skill under `plugins/macrosheet/skills/` is part of
the MacroSheet product and remains repository-owned.

# Public Repository Content

Keep committed content suitable for public distribution. Use generic tester
labels, synthetic examples, and repository-relative paths. Do not include
personal names, private account details, local usernames, machine-specific
absolute paths, private spreadsheet links, or unrelated project details.

Document external tool locations using environment variables or generic
placeholders. Before committing or publishing, inspect the complete staged diff
for personal information, including documentation, examples, and generated files.

# Skill And MCP Separation

The tracking skill owns Google account/tracker selection, Sheet reads and writes,
readback verification, nutrition-source research and assembling numeric snapshots.
Google Sheets holds the user's records/settings; the host holds authorization.
Fixed schema and formula rules belong in the bundled skill/references.

Public MCP calculation/rendering tools must complete their own operations using
supplied numeric inputs and defined display metadata. Do not instruct the model
to invoke another plugin or connector to complete a public tool's operation.
Do not add Google access, credentials or persistent tracking state to the
presentation service. Source validation and write verification belong to the
skill; numeric acceptance or rendering is not evidence of a Sheet save.

Apply this boundary to handlers, server instructions, tool descriptions, widget
follow-ups, tests and documentation. The existing tracking-guide fallback and
embedded connector instructions are documented transition debt, not the target
architecture. Preserve that fallback until installed-skill activation and the
logging/dashboard experience are proved in ordinary Chat and mobile; do not
remove it blindly or claim that the current transition is policy approval.
Keep input validation aligned with `apps/presentation/src/snapshot.mjs` and its
synthetic tests. Service checks do not establish installed-host/mobile behavior
or Directory approval. Do not publish incomplete review materials.

# Estimated Meal Confirmation

When meal values/portions are newly researched, extracted from images/labels,
selected/scaled from saved recipes or estimated by the agent, present an itemized
Markdown table before any meal write: one row per food item with its portion,
calories (kcal), protein (g), carbohydrates (g) and fat (g), followed by a meal
total row. Ask for explicit
confirmation, preferably a one-word “yes”, even for exact published values with
estimated=false. Say it has not been logged and ask whether to log the displayed
portion/values; a capability statement is not a confirmation question. An initial
“log this” does not approve agent-proposed values not yet shown. A changed proposal
requires new preview/confirmation. Preserve direct writes only for the current
meal's known values explicitly supplied by the user or an unchanged accepted preview.

For identified branded food without a usable supplied label, briefly invite a
packaging-label photo just before online nutrition research, then search without
waiting. Prefer readable supplied package values; research missing nutrition
before estimating, preferring the manufacturer or restaurant's official source.
Match product/variant, market, serving size and consumed portion; cite the source
and explain missing or conflicting information. Do not invent a successful lookup
or infer a brand without evidence. Web research belongs to the skill/host, not a
dependency of the public numeric MCP tools.

Personal recipes belong in one optional Recipes tab in the user's existing
tracker. Match loose names/descriptions with the host LLM using only summary
columns and stored macros; fetch only the selected full-recipe cell for a
modification, explicit recipe view or authoring/write verification. Ordinary reuse must not download recipe
bodies. Modifications are ad hoc unless an update/save-as-new is requested.
Recipe saves are separate from consumption; preserve recipe IDs/revisions,
literal cells, write/readback recovery and historical meal snapshots.

No meal, monthly-tab or invitation-marker write is authorized by a pending
meal proposal. Confirmation applies only to the latest unambiguous proposal; a repeated
“yes” must not duplicate a saved meal. Preserve stable IDs, write/readback checks,
compact receipts and automatic Day So Far. Normal single-meal logging prepares a
pending-labelled dashboard before the authorized write and reports verified save
status below it; corrections/removals and batches render after verification. Do
not repeat a prepared dashboard or ask again for unchanged accepted values. Keep these rules aligned with the bundled tracking skill and its references.

# Licensing For Derivative Work

Except where separately identified, MacroSheet is licensed under GNU AGPLv3,
version 3 only (AGPL-3.0-only). Agents modifying or deriving covered work must
preserve applicable copyright/license notices and the license text, document
modifications with the notices/dates required by the license, and provide the
applicable Corresponding Source and license information when conveying covered
work. For a modified version used to interact with users remotely over a network,
provide the prominent no-charge Corresponding Source offer required by section 13.
Respect separately identified third-party licenses and notices. Do not replace
AGPL terms or promise different rights unless an executed alternative agreement
covers the necessary rights from the relevant rightsholders.

AGPL permits commercial use subject to its conditions. User meal records, recipes
and settings do not become AGPL-licensed merely through processing. These agent
instructions explain the existing license; they add no license conditions and do
not guarantee compliance or enforcement. Read LICENSE and
plugins/macrosheet/LICENSING.md for the controlling terms and scope.

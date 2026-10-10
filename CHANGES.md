# Changes

## 10 October 2026 — service 0.9.0 / plugin 1.3.0

- Keep one current tracker and dashboard contract for the initial public release.
  Remove pre-release schema/payload guidance, snapshot 1 and its resource alias.
- Remove the redundant phone-server warning and developer-only synthetic trial
  from distributed tracking instructions. Meal confirmation and recovery remain.
- Template 2.1.0 removes the unused person-name field. Setup uses bundled native
  requests until a matching public master is published; no user data is migrated.
- Replace individual analytics preferences and the request flag with operator
  configuration. Collection and application observability remain disabled by
  default; stored event fields and fail-open behavior are unchanged.
- Include the prepared submission metadata, PNG branding and packaging validation.

Copyright and AGPL-3.0-only notices remain applicable; see LICENSE and
plugins/macrosheet/LICENSING.md.

# MacroSheet presentation service

Service 0.15.0 / guide 1.9.0 exposes `calculate_nutrition`, `show_dashboard` and
`get_tracking_guide` on `/mcp/openai`, `/mcp/claude` and legacy `/mcp`.
It has no Google credentials, tracking database or persistent nutrition payloads.
The host/skill owns source research, authorization, Sheet writes and readback.
A rendered snapshot is not proof of a saved record. Tracking is compact; the
operations guide supplies detailed setup/correction/target/review rules on demand.
Hosted instructions are returned once in content text; structuredContent holds
version/topic/fetchedAt/expiresAt, with no second instruction copy. The host can use documented
programmatic calling for bounded preparation and exact returned-cell checks;
authorized native writes and widget invocation remain separate stages.

## Local Development

Use Node.js 22 or later. From this directory:

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run test:worker
npm start
```

The server binds to `127.0.0.1`, default port 8787. `PORT` selects the port;
`ALLOWED_HOSTS` is a comma-separated list of exact hostnames without schemes/ports.
Set `WIDGET_DOMAIN` to a dedicated HTTPS widget origin, for example
`https://widgets.example.com`, with no trailing slash or path. Public-host startup
requires it; loopback development can omit it. Browser origins are denied and
widget communication uses the host bridge with an empty network CSP.

POST uses stateless Streamable HTTP and JSON responses; GET/DELETE MCP requests
return 405. `/healthz` reports readiness. Bodies are limited to 32 KiB and concurrent
requests to eight. Only snapshot version 2 and resource v2 are supported.
Day So Far uses one day; Weekly uses fourteen aligned days for local navigation.
Numeric output acceptance does not establish host display or source verification.

`npm run build` embeds scripts/styles into `dist/dashboard.html` and builds seven
static guide topics from the distributable skill: tracking, operations, presentation,
target_help, recipes, connection_help and template. tracking includes the complete
tracker-template reference; every topic is built from the exact shipped file.
Regenerate the native template from the repository root with
`node scripts/build_tracker_template.mjs` when changing its source.

## Generic Deployment

`wrangler.jsonc` is a reproducible local/test template with example hosts, disabled
Workers observability and disabled dashboard analytics. It serves no website pages.
The independently managed website owns public support/privacy/terms. The `.in`
files under `deployment/` are generic VM/proxy templates; replace their placeholders
only in your own restricted operational configuration.

Provide a reviewed account-specific configuration explicitly:

```sh
npm run deploy:worker -- --config "$WRANGLER_CONFIG"
WIDGET_DOMAIN="$EXPECTED_WIDGET_ORIGIN" MCP_SERVER_URL="$MCP_SERVER_URL" node deployment/smoke.mjs
```

Never commit credentials, account inventory, private hostnames or portal tokens.
An optional `OPENAI_APPS_CHALLENGE` returns its exact value as plain text with
no-store headers at `/.well-known/openai-apps-challenge`; absent configuration
returns 404. Host/origin checks still apply. Synthetic checks do not prove domain
ownership. Preserve existing routes, widget origin, rate limits and analytics state
when deploying updates; retain the tested revision/configuration for rollback.

Custom usage events require the enabled operator flag and dataset/HMAC binding.
There is no per-user Sheet preference or request flag. All dashboard calls are
eligible when the operator enables collection; no other tool emits events.
Collection remains disabled pending accurate public disclosure, host metadata
verification and separately authorized activation. No request-body,
tracker, nutrition or raw identity fields belong in custom analytics/logs.

## Evidence Boundaries

Node checks exercise a real HTTP MCP client. Browser checks simulate the host
bridge with the actual bundle. Worker checks cover protocol, website isolation,
challenge and rate limits. Deployed smoke verifies exact widget/guide bytes and
synthetic numeric inputs. None establishes installed-host discovery, Google saves,
mobile behavior or Directory approval. Retain hosted guidance until those separate
gates are met. See [the repository instructions](../../AGENTS.md) and
[licensing notice](../../plugins/macrosheet/LICENSING.md).

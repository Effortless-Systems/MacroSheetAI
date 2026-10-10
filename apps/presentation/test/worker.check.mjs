import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unstable_dev } from 'wrangler';
import { todaySnapshot } from './fixture.mjs';
import { mcpRoutes } from '../src/analytics.mjs';

const worker = await unstable_dev('src/worker.mjs', {
  config: 'wrangler.jsonc', local: true, ip: '127.0.0.1', port: 0,
  vars: { OPENAI_APPS_CHALLENGE: 'synthetic-worker-review-token', USAGE_ANALYTICS_ENABLED: 'true',
    USAGE_ANALYTICS_HMAC_KEY: 'synthetic-local-key-never-use-in-production' },
  logLevel: 'error', experimental: { disableExperimentalWarning: true }
});
try {
  const base = `http://127.0.0.1:${worker.port}`;
  // Website pages belong to the separately deployed website Worker.
  for (const path of ['/', '/support', '/privacy', '/terms']) {
    assert.equal((await fetch(base + path)).status, 404, 'Presentation must not serve website drafts');
  }
  const result = await promisify(execFile)(process.execPath, ['deployment/smoke.mjs'], {
    env: { ...process.env, MCP_SERVER_URL: `${base}/mcp`, WIDGET_DOMAIN: 'https://widgets.example.com' }, timeout: 30000
  });
  console.log(result.stdout.trim());
  for (const path of ['/mcp/openai', '/mcp/claude']) {
    const response = await fetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'show_dashboard', arguments: { ...todaySnapshot(), usageAnalytics: true },
        _meta: { 'openai/subject': 'synthetic-local-subject', 'openai/userLocation': { country: 'SG' } }
      } }) });
    assert.equal(response.status, 200);
    const rendered = (await response.json()).result;
    assert.equal(rendered.structuredContent.accepted, true);
    assert.equal(Object.hasOwn(rendered._meta['macrosheet/snapshot'], 'usageAnalytics'), false);
  }
  const challenge=await fetch(`${base}/.well-known/openai-apps-challenge`);
  assert.equal(challenge.status,200);
  assert.match(challenge.headers.get('content-type'),/^text\/plain/);
  assert.equal(await challenge.text(),'synthetic-worker-review-token');
  assert.equal(challenge.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(`${base}/.well-known/openai-apps-challenge/`)).status,404);
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  const responses = await Promise.all(Array.from({ length: 60 }, (_, i) => fetch(base + mcpRoutes[i % 3])));
  assert.ok(responses.some(response => response.status === 429), 'Worker must enforce its rate budget');
  assert.ok(responses.every(response => [405, 429].includes(response.status)));
  for (const path of [...mcpRoutes, '/MCP/OpenAI/']) {
    assert.equal((await fetch(base + path)).status, 429, 'All routes and Express aliases share the exhausted budget');
  }
  assert.equal((await fetch(`${base}/healthz`)).status, 200, 'Health stays available when MCP is rate limited');
  console.log('PASS: Website isolation, Workers protocol routes and rate limiting');
} finally {
  await worker.stop();
}

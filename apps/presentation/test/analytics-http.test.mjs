import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createHttpApp } from '../src/server.mjs';
import { createAnalyticsObserver, mcpRoutes } from '../src/analytics.mjs';
import { todaySnapshot } from './fixture.mjs';
const html = readFileSync(new URL('../dist/dashboard.html', import.meta.url), 'utf8');
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
const call = (args = {}, subject = 'SYNTHETIC_SUBJECT') => ({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
  name: 'show_dashboard', arguments: { ...todaySnapshot(), ...args }, _meta: { 'openai/subject': subject }
} });

test('routes, final MCP outcomes and overlapping request IDs remain isolated', async () => {
  const events = [];
  const observeDashboard = createAnalyticsObserver({ USAGE_ANALYTICS_ENABLED: 'true',
    USAGE_ANALYTICS_HMAC_KEY: 'synthetic-test-key-never-use-in-production',
    USAGE_ANALYTICS: { writeDataPoint: event => events.push(event) } });
  const listener = createHttpApp({ html, observeDashboard }).listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const post = (path, body, extraHeaders = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
  try {
    for (const route of mcpRoutes) {
      const catalog = await (await post(route, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
      assert.deepEqual(catalog.result.tools.map(t => t.name).sort(), ['calculate_nutrition', 'get_tracking_guide', 'show_dashboard']);
      const tool = catalog.result.tools.find(t => t.name === 'show_dashboard');
      assert.equal(tool.inputSchema.properties.usageAnalytics.type, 'boolean');
      assert.ok(!tool.inputSchema.required.includes('usageAnalytics'));
      for (const uri of ['ui://macrosheet/dashboard/v1.html', 'ui://macrosheet/dashboard/v2.html']) {
        const resource = await (await post(route, { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri } })).json();
        assert.equal(resource.result.contents[0].text, html);
      }
      assert.equal((await fetch(base + route)).status, 405);
      assert.equal((await post(route, call(), { Origin: 'https://invalid.example' })).status, 403);
      assert.equal((await post(route, { payload: 'x'.repeat(40000) })).status, 413);
      for (const flag of [undefined, false, 'true', 1, null]) await (await post(route, call({ usageAnalytics: flag }))).text();
    }
    assert.equal(events.length, 0);
    const responses = await Promise.all(mcpRoutes.map((route, i) => post(route, call({ usageAnalytics: true }, `SYNTHETIC_${i}`))));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const result = (await response.json()).result;
      assert.equal(result.structuredContent.accepted, true);
      assert.equal(Object.hasOwn(result._meta['macrosheet/snapshot'], 'usageAnalytics'), false);
      assert.doesNotMatch(JSON.stringify(result), /usageAnalytics|SYNTHETIC_/);
    }
    assert.equal(events.length, 3);
    assert.deepEqual(events.map(e => e.blobs[2]).sort(), ['claude', 'legacy', 'openai']);
    assert.equal(new Set(events.map(e => e.indexes[0])).size, 3);
    const invalid = await post('/mcp/openai', call({ usageAnalytics: true, days: [] }));
    assert.equal(invalid.status, 200);
    assert.equal((await invalid.json()).result.isError, true);
    assert.equal(events.at(-1).blobs[3], 'tool_error');
    const rejected = await post('/mcp/openai', call({ usageAnalytics: true }), { Accept: 'application/json' });
    assert.equal(rejected.status, 406); await rejected.text();
    assert.equal(events.at(-1).blobs[3], 'protocol_error');
    const handle = StreamableHTTPServerTransport.prototype.handleRequest;
    try {
      StreamableHTTPServerTransport.prototype.handleRequest = async () => { throw Error('PRIVATE_TRANSPORT_ERROR'); };
      const failed = await post('/mcp/openai', call({ usageAnalytics: true }));
      assert.equal(failed.status, 500); await failed.text();
      StreamableHTTPServerTransport.prototype.handleRequest = async (_req, res) => {
        res.writeHead(200); res.write('{'); throw Error('PRIVATE_PARTIAL_RESPONSE');
      };
      const partial = await post('/mcp/openai', call({ usageAnalytics: true }));
      assert.equal(partial.status, 200); await partial.text();
    } finally { StreamableHTTPServerTransport.prototype.handleRequest = handle; }
    assert.equal(events.at(-1).blobs[3], 'transport_error');
    assert.equal(events.length, 7);
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|SYNTHETIC_|tracker|kcal|snapshot/);
  } finally { await new Promise(resolve => listener.close(resolve)); }
});

test('missing analytics configuration and observer/writer failures leave rendering functional', async () => {
  for (const observeDashboard of [undefined, createAnalyticsObserver({}),
    createAnalyticsObserver({ USAGE_ANALYTICS_ENABLED: 'true', USAGE_ANALYTICS: { writeDataPoint() { throw Error('private'); } } }),
    createAnalyticsObserver({ USAGE_ANALYTICS_ENABLED: 'true', USAGE_ANALYTICS_HMAC_KEY: 'synthetic-test-key-never-use-in-production', USAGE_ANALYTICS: { writeDataPoint() { throw Error('private'); } } }),
    () => { throw Error('private'); }, () => () => { throw Error('private'); }]) {
    const listener = createHttpApp({ html, observeDashboard }).listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${listener.address().port}/mcp/openai`, { method: 'POST', headers, body: JSON.stringify(call({ usageAnalytics: true })) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).result.structuredContent.accepted, true);
    } finally { await new Promise(resolve => listener.close(resolve)); }
  }
});

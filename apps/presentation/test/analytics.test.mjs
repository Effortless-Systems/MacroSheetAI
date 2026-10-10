import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createAnalyticsObserver } from '../src/analytics.mjs';

const secret = 'synthetic-test-key-never-use-in-production';
const request = () => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
  name: 'show_dashboard', arguments: { tracker: 'PRIVATE_TRACKER', meals: [{ kcal: 123 }] },
  _meta: { 'openai/subject': 'PRIVATE_SUBJECT', 'openai/session': 'PRIVATE_SESSION',
    'openai/userAgent': 'PRIVATE_AGENT', 'openai/userLocation': { country: 'sg', city: 'PRIVATE_CITY' } }
} });
const bindings = events => ({ USAGE_ANALYTICS_ENABLED: 'true', USAGE_ANALYTICS_HMAC_KEY: secret,
  USAGE_ANALYTICS: { writeDataPoint: event => events.push(event) } });

test('bounded allowlist, provider HMAC and one event per request without payload retention', () => {
  const events = [], observe = createAnalyticsObserver(bindings(events)), input = request();
  const finish = observe(input, 'openai');
  input.params._meta['openai/subject'] = 'CHANGED';
  finish('success'); finish('tool_error');
  observe(request(), 'legacy')('tool_error');
  assert.equal(events.length, 2);
  assert.deepEqual(Object.keys(events[0]).sort(), ['blobs', 'doubles', 'indexes']);
  assert.deepEqual(events[0].blobs, ['1', '0.16.0', 'openai', 'success', 'SG', 'openai_subject']);
  assert.equal(events[0].indexes[0], `openai:${createHmac('sha256', secret).update('openai\0PRIVATE_SUBJECT').digest('hex')}`);
  assert.deepEqual(events[0].indexes, events[1].indexes);
  assert.equal(events[0].doubles.length, 1);
  assert.ok(Number.isFinite(events[0].doubles[0]) && events[0].doubles[0] >= 0);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|CHANGED|kcal|meals|tracker/);
  const rotated = bindings(events); rotated.USAGE_ANALYTICS_HMAC_KEY += '-rotated';
  createAnalyticsObserver(rotated)(request(), 'openai')('success');
  assert.notEqual(events[0].indexes[0], events[2].indexes[0]);
});

test('missing or unsupported metadata stays unknown; metadata bounds cannot leak into events', () => {
  const events = [], observe = createAnalyticsObserver(bindings(events));
  observe(request(), 'claude')('success');
  assert.deepEqual(events[0].blobs.slice(4), ['unknown', 'unavailable']);
  assert.deepEqual(events[0].indexes, ['unknown:claude']);
  for (const meta of [undefined, {}, { 'openai/subject': 42 },
    { 'openai/subject': 'x'.repeat(513), 'openai/userLocation': { country: 'PRIVATE_COUNTRY' } },
    { 'openai/subject': 'bad\nvalue', 'openai/userLocation': { country: ['SG'] } }]) {
    const input = request(); input.params._meta = meta;
    observe(input, 'openai')('protocol_error');
    assert.deepEqual(events.at(-1).blobs.slice(4), ['unknown', 'unavailable']);
    assert.deepEqual(events.at(-1).indexes, ['unknown:openai']);
  }
});

test('collection requires operator configuration and a dashboard request', () => {
  const events = [], configured = bindings(events);
  for (const overrides of [{ USAGE_ANALYTICS_ENABLED: 'false' }, { USAGE_ANALYTICS_ENABLED: true },
    { USAGE_ANALYTICS: undefined }, { USAGE_ANALYTICS_HMAC_KEY: undefined }, { USAGE_ANALYTICS_HMAC_KEY: 'short' }]) {
    assert.equal(createAnalyticsObserver({ ...configured, ...overrides })(request(), 'openai'), undefined);
  }
  const observe = createAnalyticsObserver(configured);
  for (const edit of [r => delete r.id, r => r.params.name = 'calculate_nutrition', r => r.method = 'resources/read']) {
    const input = request(); edit(input); assert.equal(observe(input, 'openai'), undefined);
  }
  assert.equal(observe([request()], 'openai'), undefined);
  assert.equal(observe(request(), 'spoofed'), undefined);
  observe(request(), 'openai')('PRIVATE_ERROR');
  assert.deepEqual(events, []);
});

test('analytics writer failure is swallowed without retrying', () => {
  let attempts = 0;
  const config = bindings([]); config.USAGE_ANALYTICS.writeDataPoint = () => { attempts++; throw Error('PRIVATE_ERROR'); };
  const finish = createAnalyticsObserver(config)(request(), 'openai');
  assert.doesNotThrow(() => finish('transport_error'));
  finish('success');
  assert.equal(attempts, 1);
});

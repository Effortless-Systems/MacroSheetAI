import { createHmac } from 'node:crypto';
import packageInfo from '../package.json' with { type: 'json' };
const { version } = packageInfo;

export const mcpRoutes = ['/mcp', '/mcp/openai', '/mcp/claude'];

// Only these primitives survive the request; never retain a body or raw identity.
export function createAnalyticsObserver(bindings) {
  return (request, channel) => {
    try {
      const secret = bindings.USAGE_ANALYTICS_HMAC_KEY;
      if (bindings.USAGE_ANALYTICS_ENABLED !== 'true' ||
          typeof bindings.USAGE_ANALYTICS?.writeDataPoint !== 'function' ||
          typeof secret !== 'string' || secret.length < 32 || secret.length > 4096 ||
          !['legacy', 'openai', 'claude'].includes(channel) ||
          !request || Array.isArray(request) || request.method !== 'tools/call' ||
          !['string', 'number'].includes(typeof request.id) ||
          request.params?.name !== 'show_dashboard') return;

      const started = performance.now();
      const meta = channel === 'claude' ? undefined : request.params?._meta;
      const subject = meta?.['openai/subject'];
      const identified = typeof subject === 'string' && subject.length > 0 && subject.length <= 512 && !/[\x00-\x1f\x7f]/.test(subject);
      const index = identified ? `openai:${createHmac('sha256', secret).update('openai\0').update(subject).digest('hex')}` : `unknown:${channel}`;
      const country = meta?.['openai/userLocation']?.country;
      const blobs = ['1', version, channel, '', typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : 'unknown', identified ? 'openai_subject' : 'unavailable'];
      let finished = false;
      return outcome => {
        if (finished) return;
        finished = true;
        if (!['success', 'tool_error', 'protocol_error', 'transport_error'].includes(outcome)) return;
        blobs[3] = outcome;
        try {
          // Analytics Engine queues writes synchronously; there is no network await or retry.
          bindings.USAGE_ANALYTICS.writeDataPoint({ blobs, doubles: [Math.max(0, performance.now() - started)], indexes: [index] });
        } catch { /* Telemetry must never change a tool response or log its payload. */ }
      };
    } catch { return; }
  };
}

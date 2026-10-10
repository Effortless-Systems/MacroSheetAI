import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createHttpApp } from './server.mjs';
import { createAnalyticsObserver, mcpRoutes } from './analytics.mjs';
import html from '../dist/dashboard.html';

if (!env.WIDGET_DOMAIN || !env.ALLOWED_HOSTS) throw new Error('Configure WIDGET_DOMAIN and ALLOWED_HOSTS.');
const handler = httpServerHandler(createServer(createHttpApp({
  html, widgetDomain: env.WIDGET_DOMAIN, allowedHosts: env.ALLOWED_HOSTS.split(','),
  challengeToken: env.OPENAI_APPS_CHALLENGE, observeDashboard: createAnalyticsObserver(env)
})));

export default {
  async fetch(request, bindings, ctx) {
    // shortcut: budget is per Cloudflare location; use a Durable Object if a global cap becomes necessary.
    if (mcpRoutes.includes(new URL(request.url).pathname.replace(/\/$/, '').toLowerCase()) && !(await bindings.MCP_RATE_LIMIT.limit({ key: 'mcp' })).success) {
      return new Response(null, { status: 429, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } });
    }
    return handler.fetch(request, bindings, ctx);
  }
};

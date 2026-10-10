import express from 'express';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { calculationSchema, calculationResultSchema, calculateNutrition } from './nutrition.mjs';
import { snapshotRequestSchema, normalizeSnapshot } from './snapshot.mjs';
import { mcpRoutes } from './analytics.mjs';
import packageInfo from '../package.json' with { type: 'json' };
import guides from '../dist/tracking-guides.json' with { type: 'json' };

const { version } = packageInfo;
export const resourceUri = 'ui://macrosheet/dashboard/v2.html';
const guideTopicSchema = z.enum(['tracking', 'presentation', 'target_help', 'recipes', 'connection_help', 'template']);
const guideCachePolicy = 'Reuse each hosted guide topic for at most 24 hours, before expiresAt; never extend expiry on reuse. Fetch again if instructions, timestamps or current time are unavailable. On any MacroSheet or Google tracking tool error while relying on hosted guidance, invalidate cached guidance and refresh tracking once for that logical operation, then needed topics. A retry error within that operation does not permit another guide refresh. Replace only after a successful fetch; a changed version invalidates other topics. A failed guide fetch must not trigger recursive refresh or reuse of invalidated guidance. Refresh does not authorize an action retry or duplicate save; preserve IDs, confirmation and write/readback recovery.';

function validateWidgetDomain(domain) {
  if (domain === undefined) return; // Local development may use the host's default sandbox.
  const url = new URL(domain);
  if (url.protocol !== 'https:' || url.origin !== domain || url.hostname === 'web-sandbox.oaiusercontent.com') {
    throw new Error('WIDGET_DOMAIN must be a dedicated HTTPS origin without a path, query or fragment.');
  }
}

export function createMcpServer(html, { widgetDomain } = {}) {
  validateWidgetDomain(widgetDomain);
  const server = new McpServer({ name: 'macrosheet-presentation', version }, {
    instructions: `Public static guidance, deterministic calculations and presentation only. The tracking skill owns Google selection, authorization, writes and readback; this server cannot access Google or save records. Prefer get_tracking_guide for current hosted tracking guidance. ${guideCachePolicy} For meal tracking, prepare presentation guidance and discover show_dashboard before confirmation when possible, including plain yes follow-ups. A missing renderer does not block an authorized save. Complete accepted meals through bounded write, verified readback, complete affected-day snapshot, show_dashboard, then a compact receipt. Render once per affected consumed date; explicit text-only requests override it. Use supplied numeric snapshots for independent rendering; never invent source values. An accepted render needs no duplicate totals or display-unconfirmed warning. Text fallback is for an observed error, unsupported host, reported missing card or explicit text-only request. Acceptance does not prove display or a Sheet save. Never repeat a save because rendering failed. Detailed tracker, preview and recovery rules remain in the skill and retained guide.`
  });
  registerAppResource(server, 'dashboard', resourceUri, {}, async () => ({ contents: [{
    uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html,
    _meta: {
      ui: { ...(widgetDomain ? { domain: widgetDomain } : {}), prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
      ...(widgetDomain ? { 'openai/widgetDomain': widgetDomain } : {}),
      'openai/widgetDescription': 'MacroSheet Day So Far or Weekly card shows the selected dates, logged calorie and macro totals, current targets and coverage. These daily/weekly totals are already in the card; accompanying text needs only a brief meal receipt, without another totals table or summary.'
    }
  }] }));
  server.registerTool('get_tracking_guide', {
    title: 'Get MacroSheet tracking instructions',
    description: 'Use for MacroSheet setup, meal logging/corrections/removals, recipes, targets and dashboard follow-ups when hosted tracking guidance is needed. Prefer tracking; reuse each topic for at most 24 hours, before expiresAt. Missing or expired guidance requires a fetch; a tracking-tool error invalidates it and permits one guide refresh, never an action retry. presentation covers renderer preparation, automatic Day So Far after verified meal changes and observed-failure recovery; target_help, recipes, connection_help and template supply their focused references. A plain yes continues the accepted proposal through readback and show_dashboard. This tool returns public instructions only; it does not access Google or authorize a write.',
    inputSchema: z.object({ topic: guideTopicSchema.default('tracking') }).strict(),
    outputSchema: z.object({ version: z.string(), topic: guideTopicSchema, fetchedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), instructions: z.string() }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: [{ type: 'noauth' }] }
  }, async ({ topic }) => {
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
    return { structuredContent: { version: guides.version, topic, fetchedAt: fetchedAt.toISOString(), expiresAt, instructions: guides[topic] }, content: [{ type: 'text', text: `MacroSheet skill ${guides.version}; ${topic}. Fetched at ${fetchedAt.toISOString()}; expires at ${expiresAt}. ${guideCachePolicy} tracking includes SKILL.md and tracker-template.md. References presentation.md, target-help.md, recipes.md and connection-help.md are topics presentation, target_help, recipes and connection_help; tracker-template.json is topic=template. Use the included workflow directly; do not refetch a still-valid topic to follow its own instructions.\n\n${guides[topic]}` }] };
  });
  server.registerTool('calculate_nutrition', {
    title: 'Calculate nutrition values',
    description: 'Use for nutrition sums, portion scaling or calories from protein/carbohydrate/fat before saving a meal or answering a numeric question. Shared JavaScript performs the arithmetic. Supply only numeric items; preserve known calories, use kcal=null only to estimate missing calories by 4/4/9, and label usedMacroEstimate as estimated. Does not read or write Google, set targets, or render a widget.',
    inputSchema: calculationSchema,
    outputSchema: calculationResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: [{ type: 'noauth' }] }
  }, async input => {
    try {
      const result = calculateNutrition(input);
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Calculation exceeds supported numeric bounds; check amounts and portion multipliers.' }] };
    }
  });
  registerAppTool(server, 'show_dashboard', {
    title: 'Show MacroSheet dashboard',
    description: 'Use to show MacroSheet Day So Far after a verified meal change, or a requested daily/Weekly dashboard, from complete supplied numeric values. Use v2 view=today for each affected consumed date, including backdated dates; weekly needs fourteen aligned days. Supply meals or days, never both; the schema describes limits, derived dates and empty days. No source connection is required. This tool validates and prepares a widget, not source truth or a saved record. After acceptance keep the meal receipt compact without repeating dashboard totals or reporting unobserved display failure. Explicit text-only requests override automatic rendering. Send no meal descriptions, record IDs, Sheet links or credentials; trackerRef is an opaque conversation-local reference.',
    inputSchema: snapshotRequestSchema,
    outputSchema: z.object({ accepted: z.literal(true), snapshotId: z.string().uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: [{ type: 'noauth' }], ui: { resourceUri, visibility: ['model'] }, 'openai/outputTemplate': resourceUri }
  }, async (input) => ({
    structuredContent: { accepted: true, snapshotId: input.snapshotId },
    content: [{ type: 'text', text: 'Dashboard prepared.' }],
    _meta: { 'macrosheet/snapshot': normalizeSnapshot(input) }
  }));
  return server;
}

export function createHttpApp({ html, allowedHosts = ['127.0.0.1', 'localhost'], allowedOrigins = [], maxConcurrent = 8, widgetDomain, challengeToken, observeDashboard } = {}) {
  if (!html) throw new Error('Build the widget before starting the server.');
  validateWidgetDomain(widgetDomain);
  if (challengeToken !== undefined && (typeof challengeToken !== 'string' || !challengeToken.length || challengeToken.length > 4096 || challengeToken.trim() !== challengeToken || /[\x00-\x1f\x7f]/.test(challengeToken))) {
    throw new Error('OPENAI_APPS_CHALLENGE must be one nonempty plain-text token without whitespace padding or control characters.');
  }
  const app = express();
  app.disable('x-powered-by');
  let active = 0;
  app.use((req, res, next) => {
    let hostname;
    try { hostname = new URL(`http://${req.headers.host}`).hostname; } catch { return res.sendStatus(400); }
    if (!allowedHosts.includes(hostname) || (req.headers.origin && !allowedOrigins.includes(req.headers.origin))) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store'); next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', version }));
  app.get('/.well-known/openai-apps-challenge', (req, res) => {
    if (!challengeToken || req.path !== '/.well-known/openai-apps-challenge') return res.sendStatus(404);
    return res.type('text/plain').send(challengeToken);
  });
  app.use('/mcp', (req, res, next) => {
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').end();
    if (active >= maxConcurrent) return res.status(503).set('Retry-After', '1').end();
    active++;
    res.once('close', () => active--);
    next();
  }, express.json({ limit: '32kb' }));
  app.post(mcpRoutes, async (req, res) => {
    const server = createMcpServer(html, { widgetDomain });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let observe, transportFailed = false;
    try { observe = observeDashboard?.(req.body, req.path.split('/')[2]?.toLowerCase() || 'legacy'); } catch { /* Fail open. */ }
    if (observe) {
      let outcome, finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const finalOutcome = transportFailed || !res.writableFinished || res.statusCode >= 500 ? 'transport_error'
          : res.statusCode >= 400 ? 'protocol_error' : outcome || 'protocol_error';
        try { observe(finalOutcome); } catch { /* Fail open. */ }
      };
      const send = transport.send.bind(transport);
      transport.send = async (message, options) => {
        if (message.id === req.body.id) {
          if (message.error) outcome = 'protocol_error';
          else if (message.result) outcome = message.result.isError ? 'tool_error' : 'success';
        }
        return send(message, options);
      };
      res.once('finish', finish);
      res.once('close', finish);
    }
    res.once('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { transportFailed = true; if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' }); else res.end(); }
  });
  // Never serialize SDK/validation errors, request bodies or credentials to logs.
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid request' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT');
  const html = readFileSync(new URL('../dist/dashboard.html', import.meta.url), 'utf8');
  const allowedHosts = (process.env.ALLOWED_HOSTS || '127.0.0.1,localhost').split(',');
  const widgetDomain = process.env.WIDGET_DOMAIN;
  if (!widgetDomain && allowedHosts.some(host => !['127.0.0.1', 'localhost'].includes(host))) {
    throw new Error('Set WIDGET_DOMAIN to the unique widget HTTPS origin for this deployment.');
  }
  const app = createHttpApp({ html, allowedHosts, widgetDomain, challengeToken: process.env.OPENAI_APPS_CHALLENGE });
  const listener = app.listen(port, '127.0.0.1', () => console.info('MacroSheet presentation ready'));
  listener.requestTimeout = 15000;
  listener.headersTimeout = 10000;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    listener.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

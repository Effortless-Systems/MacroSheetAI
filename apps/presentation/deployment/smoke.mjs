// Run from this package: WIDGET_DOMAIN=https://HOST MCP_SERVER_URL=https://HOST/mcp node deployment/smoke.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {parseSnapshotRequest} from '../src/snapshot.mjs';
import {snapshot,todaySnapshot,weeklySnapshot,emptyTodayRequest,afterMidnightRequest} from '../test/fixture.mjs';

const endpoint = new URL(process.env.MCP_SERVER_URL);
assert.ok(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname)), 'Use HTTPS except for loopback tests');
const widgetDomain = process.env.WIDGET_DOMAIN;
assert.ok(widgetDomain, 'Set WIDGET_DOMAIN to the expected unique widget origin');
assert.equal(new URL(widgetDomain).origin, widgetDomain);
assert.equal(new URL(widgetDomain).protocol, 'https:');
const client = new Client({name:'macrosheet-deployment-check',version:'1'});
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const {tools} = await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(), ['calculate_nutrition','get_tracking_guide','show_dashboard']);
  for (const tool of tools) {
    assert.equal(tool.outputSchema?.type, 'object');
    assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);
    assert.deepEqual([tool.annotations.readOnlyHint,tool.annotations.destructiveHint,tool.annotations.openWorldHint],[true,false,false]);
  }
  const uri = tools.find(t=>t.name==='show_dashboard')._meta.ui.resourceUri;
  assert.equal(uri, 'ui://macrosheet/dashboard/v2.html');
  assert.equal(tools.find(t=>t.name==='show_dashboard')._meta['openai/outputTemplate'],uri);
  const resource = await client.readResource({uri});
  assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(resource.contents[0].text, /MacroSheet/);
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(resource.contents[0].text),digest(readFileSync(new URL('../dist/dashboard.html',import.meta.url))),'Live widget must match the built release');
  await assert.rejects(client.readResource({uri:'ui://macrosheet/dashboard/v1.html'}));
  assert.equal(Object.hasOwn(tools.find(t=>t.name==='show_dashboard').inputSchema.properties,'usageAnalytics'),false);
  for (const item of [resource]) {
    assert.equal(item.contents[0]._meta.ui.domain, widgetDomain);
    assert.equal(item.contents[0]._meta['openai/widgetDomain'], widgetDomain);
    assert.deepEqual(item.contents[0]._meta.ui.csp, {connectDomains:[],resourceDomains:[]});
  }
  const guides=JSON.parse(readFileSync(new URL('../dist/tracking-guides.json',import.meta.url),'utf8'));
  for(const topic of ['tracking','operations','presentation','target_help','recipes','connection_help','template']) {
    const guide=await client.callTool({name:'get_tracking_guide',arguments:{topic}});
    const {fetchedAt,expiresAt,...body}=guide.structuredContent;
    assert.deepEqual(body, {version:guides.version,topic,instructions:guides[topic]});
    assert.ok(Number.isFinite(Date.parse(fetchedAt)), 'Guide fetch time must be valid');
    assert.equal(Date.parse(expiresAt)-Date.parse(fetchedAt),24*60*60*1000);
    assert.ok(guide.content[0].text.includes(`Fetched at ${fetchedAt}; expires at ${expiresAt}`));
    assert.ok(guide.content[0].text.endsWith(guides[topic]), 'Live guidance must match the built release');
  }
  const calculated=await client.callTool({name:'calculate_nutrition',arguments:{items:[{kcal:null,protein:10,carbs:20,fat:5}]}});
  assert.equal(calculated.structuredContent.kcal,165);
  const numeric=todaySnapshot();delete numeric.days;numeric.meals=[{date:numeric.focusDate,kcal:100,protein:10,carbs:12,fat:4}];
  assert.equal((await client.callTool({name:'show_dashboard',arguments:numeric})).structuredContent.accepted,true);
  const input = snapshot();
  const result = await client.callTool({name:'show_dashboard',arguments:input});
  assert.deepEqual(result.structuredContent, {accepted:true,snapshotId:input.snapshotId});
  assert.doesNotMatch(JSON.stringify({content:result.content,structuredContent:result.structuredContent}), /Test tracker|tracker-a|protein/);
  assert.deepEqual(result._meta['macrosheet/snapshot'],parseSnapshotRequest(input).data);
  for(const data of [todaySnapshot(),weeklySnapshot(0),emptyTodayRequest(),afterMidnightRequest(),{...todaySnapshot(),today:undefined,periodStart:undefined}]) {
    const rendered = await client.callTool({name:'show_dashboard',arguments:data});
    assert.deepEqual(rendered.structuredContent,{accepted:true,snapshotId:data.snapshotId});
    assert.doesNotMatch(JSON.stringify({content:rendered.content,structuredContent:rendered.structuredContent}),/Test tracker|tracker-a|protein/);
    assert.deepEqual(rendered._meta['macrosheet/snapshot'],parseSnapshotRequest(data).data);
  }
  for(const data of [{...input,days:[]},{...todaySnapshot(),view:'weekly'},{...weeklySnapshot(),periodStart:'not-a-date'}]) {
    assert.equal((await client.callTool({name:'show_dashboard',arguments:data})).isError,true);
  }
  // Bounded load: two requests at a time, below the deployed aggregate rate limit.
  for (let batch=0; batch<5; batch++) {
    await new Promise(resolve=>setTimeout(resolve,600));
    await Promise.all([0,1].map(async()=>{
      assert.equal((await client.callTool({name:'show_dashboard',arguments:input})).structuredContent.accepted,true);
    }));
  }
  const health=await fetch(new URL('/healthz',endpoint));
  assert.equal(health.status,200);
  const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
  assert.equal((await health.json()).version,version);
  const challenge=await fetch(new URL('/.well-known/openai-apps-challenge',endpoint));
  if(process.env.OPENAI_APPS_CHALLENGE) {
    assert.equal(challenge.status,200,'Domain challenge must be available');
    assert.match(challenge.headers.get('content-type'),/^text\/plain/);
    // Do not use assertion output that could print an actual configured token.
    assert.ok((await challenge.text())===process.env.OPENAI_APPS_CHALLENGE,'Domain challenge must exactly match configured token');
  } else assert.ok([200,404].includes(challenge.status),'Optional domain challenge has an unexpected status');
  assert.equal((await fetch(endpoint)).status,405);
  assert.equal((await fetch(endpoint,{method:'POST',headers:{Origin:'https://invalid.example'}})).status,403);
  assert.equal((await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:'x'.repeat(40000)})})).status,413);
  console.log('PASS: MCP discovery, exact deployed widget hash, v2 Today/Weekly, empty-day/midnight/derived-date regressions, retired resource rejection, acknowledgements, invalid input, service version, request limits and 10 bounded calls. Chat-client rendering remains a separate test.');
} finally { await client.close(); }

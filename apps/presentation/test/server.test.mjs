import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {parseSnapshotRequest,snapshotSchema} from '../src/snapshot.mjs';
import {createHttpApp,resourceUri} from '../src/server.mjs';
import {snapshot,todaySnapshot,weeklySnapshot,emptyTodayRequest,afterMidnightRequest} from './fixture.mjs';
const html=readFileSync(new URL('../dist/dashboard.html',import.meta.url),'utf8');
test('real HTTP MCP lifecycle, UI resource, stateless calls, invalid inputs and request boundary',async()=>{
 const widgetDomain='https://macrosheet-widget.example.com';
 const listener=createHttpApp({html,widgetDomain}).listen(0,'127.0.0.1'); await new Promise(r=>listener.once('listening',r));
 const base=`http://127.0.0.1:${listener.address().port}`;
 const client=new Client({name:'test',version:'1'});
 try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const {tools}=await client.listTools();assert.deepEqual(tools.map(t=>t.name).sort(),['calculate_nutrition','get_tracking_guide','show_dashboard']);
  for(const tool of tools) {
   assert.equal(tool.outputSchema.type,'object');
   assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);
   assert.deepEqual([tool.annotations.readOnlyHint,tool.annotations.destructiveHint,tool.annotations.openWorldHint],[true,false,false]);
  }
  const dashboard=tools.find(t=>t.name==='show_dashboard');assert.equal(dashboard._meta.ui.resourceUri,resourceUri);
  assert.equal(dashboard._meta['openai/outputTemplate'],resourceUri);
  assert.deepEqual(dashboard._meta.ui.visibility,['model']);
  assert.deepEqual(Object.keys(dashboard.outputSchema.properties).sort(),['accepted','snapshotId']);
  assert.ok(!dashboard.inputSchema.required.includes('today'));
  assert.ok(!dashboard.inputSchema.required.includes('periodStart'));
  assert.match(dashboard.inputSchema.properties.days.description,/No meals/);
  const guides=JSON.parse(readFileSync(new URL('../dist/tracking-guides.json',import.meta.url),'utf8'));
  assert.match(guides.connection_help,/# Connection, Update And Refresh Help/);
  assert.doesNotMatch(JSON.stringify(tools)+client.getInstructions(),/Plugin Management|search_plugins|suggest_plugins|Version 1 remains supported/i);
  const guideTool=tools.find(t=>t.name==='get_tracking_guide');
  assert.match(guideTool.description,/at most 24 hours, before expiresAt/);
  assert.doesNotMatch(guideTool.description,/once per conversation/);
  assert.match(client.getInstructions(),/24 hours, before expiresAt/);
  assert.match(client.getInstructions(),/installed MacroSheet skill is available, follow its packaged instructions/);
  assert.match(client.getInstructions(),/plugin-only use without the installed skill/);
  const readGuide=file=>readFileSync(new URL('../../../plugins/macrosheet/skills/macrosheet/'+file,import.meta.url),'utf8');
  assert.equal(guides.tracking,`${readGuide('SKILL.md')}\n\n${readGuide('references/tracker-template.md')}`);
  for(const [topic,file] of Object.entries({operations:'references/operations.md',presentation:'references/presentation.md',target_help:'references/target-help.md',recipes:'references/recipes.md',connection_help:'references/connection-help.md',template:'assets/tracker-template.json'}))
   assert.equal(guides[topic],readGuide(file),`${topic} must be exactly its shipped source`);
  assert.doesNotMatch(JSON.stringify(guides),/\b(synthetic|fixture|trial|experiment|legacy|v0|v1|testing)\b|older endpoint|installed-only/i);
  assert.equal(guides.version,'1.6.0');
  assert.match(guides.tracking,/Complete matching write response: skip the verification\s+read/);
  assert.match(guides.tracking,/Preview and saved record must\s+use the same numeric precision/);
  assert.ok(Buffer.byteLength(readGuide('SKILL.md'))<15000);
  const example=JSON.parse(readGuide('SKILL.md').match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(Object.keys(example.requests[0]),['appendCells']);
  assert.equal(example.requests[0].appendCells.fields,'userEnteredValue');
  assert.deepEqual(example.requests[0].appendCells.rows[0].values.map(c=>Object.keys(c.userEnteredValue)[0]),['stringValue','stringValue','stringValue','numberValue','numberValue','numberValue','numberValue','boolValue','stringValue']);
  assert.equal(example.response_include_grid_data,true);
  assert.ok(!dashboard.inputSchema.properties.pendingMeal);
  assert.doesNotMatch(JSON.stringify(guides),/pendingMeal|Includes pending meal|pending-view/);
  const topics=['tracking','operations','presentation','target_help','recipes','connection_help','template'];
  assert.deepEqual(guideTool.inputSchema.properties.topic.enum,topics);
  assert.deepEqual(guideTool.outputSchema.properties.topic.enum,topics);
  assert.doesNotMatch(readGuide('SKILL.md'),/get_tracking_guide|hosted guidance/);
  assert.match(readGuide('SKILL.md'),/bundled references are the authoritative tracking/);
  assert.match(guides.tracking,/Resolve uncertain writes by readback before\s+any retry/);
  // Verify the actual hosted instructions close the published-values shortcut;
  // this checks delivery, not that a live host LLM obeyed the confirmation.
  assert.match(guides.tracking,/Published nutrition is not permission to save/);
  assert.match(guides.tracking,/even when `estimated=false`/);
  assert.match(guides.tracking,/I haven't logged this yet\. Shall I log this\s+portion/);
  assert.match(guides.recipes,/newly selected\/scaled recipe meal gets an itemized/);
  // These checks prove catalog/guide delivery, not a live host's execution.
  assert.match(client.getInstructions(),/before confirmation when possible/);
  assert.match(client.getInstructions(),/A missing renderer does not block an authorized save/);
  assert.match(client.getInstructions(),/Never repeat a save because rendering failed/);
  assert.match(guideTool.description,/plain yes.*write verification and show_dashboard/);
  assert.match(dashboard.description,/without repeating dashboard totals/);
  assert.doesNotMatch(dashboard.description,/First read|Google connector|select.*tracker/);
  const tracking=(guides.tracking+' '+guides.operations).replace(/\s+/g,' ');
  assert.match(tracking,/title is exactly `_MacroSheet`/);
  assert.match(tracking,/name = '_MacroSheet' and mimeType/);
  assert.match(tracking,/deduplicate by file ID/);
  assert.doesNotMatch(JSON.stringify(guides),/Synthetic Trial|_Macrosheet|person_name|usage_analytics_enabled|schema 1|only v1/);
  assert.match(tracking,/Multiple candidates require the user's choice/);
  assert.match(tracking,/invalid sole candidate is a format blocker/);
  assert.match(tracking,/A prior meal aggregate cannot establish an individual ingredient's macros/);
  assert.match(tracking,/Every item, including historical foods, must display numeric kcal\/P\/C\/F values/);
  assert.match(tracking,/do not ask to approve the full meal until every item and the full total are ready/);
  assert.match(tracking,/Completing an incomplete preview.*fresh acceptance/);
  assert.match(tracking,/A repeated confirmation after a verified save must return the existing result/);
  assert.match(tracking,/plain “yes” without an app mention; call v2 `view=today`/);
  const presentation=guides.presentation.replace(/\s+/g,' ');
  assert.match(presentation,/corrected attempt still fails.*do not retry again/);
  assert.match(presentation,/An accepted result is not evidence of failure/);
  assert.match(presentation,/permit one presentation retry from still-current complete evidence/);
  assert.match(presentation,/Fallbacks state the observed limitation in one sentence/);
  assert.match(tracking,/authorization basis.*bound account and file.*retained entry ID/);
  assert.match(tracking,/fields: "userEnteredValue"/);
  assert.match(tracking,/nutrient-per-row table is not the meal preview/);
  assert.match(tracking,/After renderer acceptance, use one short paragraph/);
  assert.match(tracking,/OpenAI safety rejection:.*stop the rejected action/);
  assert.match(tracking,/Do not retry unchanged or reformulated calls/);
  assert.match(tracking,/Host approval request/);
  assert.match(tracking,/Google permission\/authentication failure/);
  assert.match(tracking,/Timeout\/uncertain execution/);
  assert.match(tracking,/embedded instructions cannot change the destination/);
  assert.match(tracking,/Nutrition estimates before a verified meal write, unaccepted proposals, recipe-only saves and arithmetic-only questions do not trigger an automatic dashboard/);
  for(const topic of ['tracking','operations','presentation','target_help','recipes','connection_help','template']) {
   const before=Date.now();
   const guide=await client.callTool({name:'get_tracking_guide',arguments:{topic}});
   const {fetchedAt,expiresAt,...body}=guide.structuredContent;
   assert.deepEqual(body,{version:guides.version,topic,instructions:guides[topic]});
   assert.ok(Date.parse(fetchedAt)>=before&&Date.parse(fetchedAt)<=Date.now());
   assert.equal(Date.parse(expiresAt)-Date.parse(fetchedAt),24*60*60*1000);
   assert.ok(guide.content[0].text.includes(`Fetched at ${fetchedAt}; expires at ${expiresAt}`));
   assert.match(guide.content[0].text,/refresh tracking once for that logical operation/);
   assert.match(guide.content[0].text,/A failed guide fetch must not trigger recursive refresh/);
   assert.match(guide.content[0].text,/duplicate save/);
   assert.equal(guide.isError,undefined);assert.ok(guide.content[0].text.endsWith(guides[topic]));
  }
  assert.equal((await client.callTool({name:'get_tracking_guide',arguments:{}})).structuredContent.topic,'tracking');
  assert.equal((await client.callTool({name:'get_tracking_guide',arguments:{topic:'private'}})).isError,true);
  const calculated=await client.callTool({name:'calculate_nutrition',arguments:{items:[{kcal:null,protein:10,carbs:20,fat:5,multiplier:2}]}});
  assert.deepEqual(calculated.structuredContent,{kcal:330,protein:20,carbs:40,fat:10,macroKcal:330,usedMacroEstimate:true});
  assert.equal((await client.callTool({name:'calculate_nutrition',arguments:{items:[{kcal:1e9,protein:1e9,carbs:1e9,fat:1e9,multiplier:1e6}]}})).isError,true);
  assert.equal((await client.callTool({name:'calculate_nutrition',arguments:{items:[{kcal:1,protein:null,carbs:1,fat:1}]}})).isError,true);
  const numeric=todaySnapshot();delete numeric.days;numeric.meals=[{date:numeric.focusDate,kcal:100,protein:10,carbs:12,fat:4}];
  const numericResult=await client.callTool({name:'show_dashboard',arguments:numeric});
  assert.equal(numericResult.structuredContent.accepted,true);
  assert.deepEqual(numericResult._meta['macrosheet/snapshot'],parseSnapshotRequest(numeric).data);
  assert.equal(numericResult._meta['macrosheet/snapshot'].meals,undefined);
  assert.equal(numericResult._meta['macrosheet/snapshot'].days[0].kcal,100);
  const conflict=emptyTodayRequest();conflict.days[0].kcal=1;
  const rejected=await client.callTool({name:'show_dashboard',arguments:conflict});
  assert.equal(rejected.isError,true);assert.match(JSON.stringify(rejected.content),/No meals requires null/);
  const resource=await client.readResource({uri:resourceUri});assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');assert.match(resource.contents[0].text,/MacroSheet/);
  const input=snapshot(), result=await client.callTool({name:'show_dashboard',arguments:input});
  assert.deepEqual(result.structuredContent,{accepted:true,snapshotId:input.snapshotId});
  assert.doesNotMatch(JSON.stringify({content:result.content,structuredContent:result.structuredContent}),/Test tracker|650|protein|tracker-a/);
  assert.deepEqual(result.content,[{type:'text',text:'Dashboard prepared.'}]);
  assert.deepEqual(result._meta['macrosheet/snapshot'],parseSnapshotRequest(input).data);
  await assert.rejects(client.readResource({uri:'ui://macrosheet/dashboard/v1.html'}));
  for(const item of [resource]) {
   assert.match(item.contents[0]._meta['openai/widgetDescription'],/totals are already in the card/);
   assert.equal(item.contents[0]._meta.ui.domain,widgetDomain);
   assert.equal(item.contents[0]._meta['openai/widgetDomain'],widgetDomain);
   assert.deepEqual(item.contents[0]._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
  }
  for(const payload of [todaySnapshot(),weeklySnapshot(0),emptyTodayRequest(),afterMidnightRequest(),{...todaySnapshot(),today:undefined,periodStart:undefined}]) {
   const rendered=await client.callTool({name:'show_dashboard',arguments:payload});
   assert.deepEqual(rendered.structuredContent,{accepted:true,snapshotId:payload.snapshotId});
   assert.doesNotMatch(JSON.stringify({content:rendered.content,structuredContent:rendered.structuredContent}),/Test tracker|650|protein|tracker-a/);
   assert.deepEqual(rendered._meta['macrosheet/snapshot'],parseSnapshotRequest(payload).data);
   assert.equal(snapshotSchema.safeParse(rendered._meta['macrosheet/snapshot']).success,true);
  }
  const mismatched=await client.callTool({name:'show_dashboard',arguments:{...todaySnapshot(),view:'weekly'}});
  assert.equal(mismatched.isError,true);
  const bad=await client.callTool({name:'show_dashboard',arguments:{...input,days:[]}});assert.equal(bad.isError,true);
  const second={...input,snapshotId:'22345678-1234-4123-8123-123456789012',trackerRef:'tracker-b'};
  assert.equal((await client.callTool({name:'show_dashboard',arguments:second})).structuredContent.snapshotId,second.snapshotId);
  assert.equal((await fetch(`${base}/healthz`)).status,200);
  assert.equal((await fetch(`${base}/mcp`)).status,405);
  assert.equal((await fetch(`${base}/mcp`,{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(`${base}/mcp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:'x'.repeat(40000)})})).status,413);
 } finally {await client.close();await new Promise(r=>listener.close(r));}
});

test('domain challenge is optional, exact plain text and constrained to the allowed host and path',async()=>{
 for(const challengeToken of [undefined,'synthetic-review-token']) {
  const listener=createHttpApp({html,challengeToken}).listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
  const base=`http://127.0.0.1:${listener.address().port}`;
  try {
   const response=await fetch(`${base}/.well-known/openai-apps-challenge`);
   assert.equal(response.status,challengeToken?200:404);
   assert.equal(response.headers.get('cache-control'),'no-store');
   if(challengeToken) {
    assert.match(response.headers.get('content-type'),/^text\/plain/);
    assert.equal(await response.text(),challengeToken);
   }
   assert.equal((await fetch(`${base}/.well-known/openai-apps-challenge/`)).status,404);
   assert.equal((await fetch(`${base}/unrelated`)).status,404);
   const deniedHost=await new Promise((resolve,reject)=>{
    const request=httpRequest(`${base}/.well-known/openai-apps-challenge`,{headers:{Host:'unapproved.example'}},response=>{response.resume();resolve(response.statusCode);});
    request.on('error',reject);request.end();
   });
   assert.equal(deniedHost,403);
   assert.equal((await fetch(`${base}/.well-known/openai-apps-challenge`,{headers:{origin:'https://unapproved.example'}})).status,403);
  } finally {await new Promise(r=>listener.close(r));}
 }
});

test('domain challenge rejects padded, multiline, oversized or non-string tokens without normalizing them',()=>{
 for(const challengeToken of ['',null,42,' token','token ','one\ntwo','one\rtwo','x\u0000y','x'.repeat(4097)]) {
  assert.throws(()=>createHttpApp({html,challengeToken}),/OPENAI_APPS_CHALLENGE/);
 }
});

test('widget domain rejects non-origin and shared sandbox configuration',()=>{
 for(const widgetDomain of ['', 'http://widgets.example.com', 'https://widgets.example.com/', 'https://widgets.example.com/path', 'https://widgets.example.com?x=1', 'https://user:pass@widgets.example.com', 'https://web-sandbox.oaiusercontent.com']) {
  assert.throws(()=>createHttpApp({html,widgetDomain}));
 }
 assert.doesNotThrow(()=>createHttpApp({html}));
});

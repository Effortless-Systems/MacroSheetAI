import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {parseSnapshotRequest} from '../src/snapshot.mjs';
import {snapshot,todaySnapshot,weeklySnapshot,emptyTodayRequest,afterMidnightRequest,sharedMealScenario} from './fixture.mjs';
const html=readFileSync(new URL('../dist/dashboard.html',import.meta.url),'utf8');
function toolResult(input) {
 return {content:[{type:'text',text:'Dashboard prepared.'}],structuredContent:{accepted:true,snapshotId:input.snapshotId},_meta:{'macrosheet/snapshot':parseSnapshotRequest(input).data}};
}
async function mount(page,{input=weeklySnapshot(),order='input-first',messages=true,reject=false,delivery='legacy'}={}) {
 await page.setContent('<iframe title="MacroSheet" style="border:0;width:100%;height:1100px"></iframe>');
 await page.evaluate(({html,input,order,messages,reject,delivery,result})=>{
   window.messages=[];window.bridgeReady=false;
   const frame=document.querySelector('iframe');
   const send=(method,params)=>frame.contentWindow.postMessage({jsonrpc:'2.0',method,params},'*');
   window.sendToWidget=send;
   window.addEventListener('message',event=>{
     const m=event.data;if(event.source!==frame.contentWindow||m.jsonrpc!=='2.0')return;
     if(m.method==='ui/initialize') frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'Test harness',version:'1'},hostCapabilities:{...(messages?{message:{text:{}}}:{})},hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline'],locale:'en-GB'}}},'*');
     if(m.method==='ui/notifications/initialized') {
       window.bridgeReady=true;
       if(input) {
         const notifications=[...(delivery==='result-only'?[]:[['ui/notifications/tool-input',{arguments:input}]]),['ui/notifications/tool-result',result]];
         if(order==='result-first')notifications.reverse();
         for(const [method,params] of notifications)send(method,params);
       }
     }
     if(m.method==='ui/notifications/size-changed' && Number.isFinite(m.params?.height)) frame.style.height=`${m.params.height}px`;
     if(m.method==='ui/message') {window.messages.push(m.params);frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{isError:reject}},'*');}
   });
   frame.srcdoc=html;
 },{html,input,order,messages,reject,delivery,result:input&&(delivery==='legacy'?{content:[],structuredContent:{accepted:true,snapshotId:input.snapshotId}}:toolResult(input))});
 await expect.poll(()=>page.evaluate(()=>window.bridgeReady)).toBe(true);
 return page.frameLocator('iframe');
}

for(const order of ['input-first','result-first','result-only'])test(`canonical result hydrates backdated meals: ${order}`,async({page})=>{
 const input=todaySnapshot();input.focusDate='2025-12-29';delete input.periodStart;delete input.today;delete input.days;
 input.meals=[{date:input.focusDate,kcal:429,protein:35,carbs:39,fat:14}];
 const f=await mount(page,{input,order,delivery:order==='result-only'?'result-only':'both'});
 await expect(f.locator('#day-kcal')).toHaveText('429 kcal');
 await expect(f.locator('#day-date')).toContainText(/December 29, 2025|29 December 2025/);
 await expect(f.locator('#nutrients')).not.toContainText('remaining');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 const prompt=await page.evaluate(()=>window.messages[0].content[0].text);
 expect(prompt).toContain(input.trackerRef);expect(prompt).toContain(input.snapshotId);expect(prompt).toContain(input.focusDate);
});

test('request-only analytics control does not conflict with the canonical widget result',async({page})=>{
 const input={...todaySnapshot(),usageAnalytics:true};
 const f=await mount(page,{input,delivery:'both'});
 await expect(f.locator('#day-kcal')).toHaveText('650 kcal');
 await expect(f.locator('body')).not.toContainText('usageAnalytics');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 expect(JSON.stringify(await page.evaluate(()=>window.messages))).not.toContain('usageAnalytics');
});

test('result-only empty day tolerates partial/delayed input and duplicate delivery',async({page})=>{
 const input=emptyTodayRequest();const result=toolResult(input);
 const f=await mount(page,{input,delivery:'result-only'});
 await expect(f.locator('#day-note')).toContainText('No meals logged');
 await page.evaluate(({input,result})=>{
   window.sendToWidget('ui/notifications/tool-input-partial',{arguments:{snapshotId:input.snapshotId}});
   window.sendToWidget('ui/notifications/tool-input',{arguments:input});
   window.sendToWidget('ui/notifications/tool-result',result);
   window.sendToWidget('ui/notifications/tool-result',result);
 },{input,result});
 await expect(f.locator('#day-kcal')).toHaveText('— kcal');
 await expect(f.locator('#nutrients tr')).toHaveCount(4);
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 expect(await page.evaluate(()=>window.messages.length)).toBe(1);
});

for(const conflict of ['identity','values'])test(`complete input and canonical result cannot conflict: ${conflict}`,async({page})=>{
 const input=todaySnapshot(),other=todaySnapshot();
 if(conflict==='identity')other.snapshotId='82345678-1234-4123-8123-123456789012';else other.days[0].kcal++;
 const f=await mount(page,{input:null});
 await page.evaluate(({input,result})=>{
   window.sendToWidget('ui/notifications/tool-input',{arguments:input});
   window.sendToWidget('ui/notifications/tool-result',result);
 },{input,result:toolResult(other)});
 await expect(f.locator('#dashboard')).toBeHidden();
 await expect(f.locator('#status')).toContainText('conflict');
 await page.evaluate(result=>window.sendToWidget('ui/notifications/tool-result',result),toolResult(input));
 await expect(f.locator('#day-kcal')).toHaveText('650 kcal');
});

test('invalid or cancelled canonical results never fall back to successful input',async({page})=>{
 const input=todaySnapshot();const f=await mount(page,{input:null});
 const invalid=[toolResult(input),toolResult(input),toolResult(input),toolResult(input)];
 invalid[0]._meta['macrosheet/snapshot'].days[0].kcal=-1;
 invalid[1]._meta['macrosheet/snapshot'].sheetId='forbidden';
 invalid[2].structuredContent.snapshotId='92345678-1234-4123-8123-123456789012';
 invalid[3]._meta['macrosheet/snapshot']=null;
 for(const result of invalid) {
   await page.evaluate(({input,result})=>{
     window.sendToWidget('ui/notifications/tool-input',{arguments:input});
     window.sendToWidget('ui/notifications/tool-result',result);
   },{input,result});
   await expect(f.locator('#dashboard')).toBeHidden();
   await expect(f.locator('#status')).toContainText('invalid');
 }
 await page.evaluate(({input,result})=>{
   window.sendToWidget('ui/notifications/tool-cancelled',{reason:'cancelled'});
   window.sendToWidget('ui/notifications/tool-result',result);
   window.sendToWidget('ui/notifications/tool-input',{arguments:input});
 },{input,result:toolResult(input)});
 await expect(f.locator('#dashboard')).toBeHidden();
 await expect(f.locator('#status')).toContainText('cancelled');
});

test('new input cannot reuse the previous canonical result',async({page})=>{
 const input=todaySnapshot(),next=todaySnapshot();
 next.snapshotId='a2345678-1234-4123-8123-123456789012';next.trackerRef='tracker-b';next.days[0].kcal=700;
 const f=await mount(page,{input,delivery:'both'});
 await page.evaluate(input=>window.sendToWidget('ui/notifications/tool-input',{arguments:input}),next);
 await expect(f.locator('#dashboard')).toBeHidden();
 await page.evaluate(result=>window.sendToWidget('ui/notifications/tool-result',result),toolResult(next));
 await expect(f.locator('#day-kcal')).toHaveText('700 kcal');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 expect(await page.evaluate(()=>window.messages[0].content[0].text)).toContain('tracker-b');
 await page.evaluate(snapshotId=>window.sendToWidget('ui/notifications/tool-result',{content:[],structuredContent:{accepted:true,snapshotId}}),input.snapshotId);
 await expect(f.locator('#dashboard')).toBeHidden();
});
for(const width of [320,390,960])test(`inline bridge and navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1200});const f=await mount(page);
 await expect(f.locator('#today-view')).toBeHidden();
 await expect(f.locator('#weekly-view')).toBeVisible();
 await expect(f.locator('#week-total')).toHaveText('650 kcal logged');
 await f.getByRole('button',{name:'Previous week',exact:true}).click();
 await expect(f.locator('#week-total')).toHaveText('500 kcal logged');
 expect(await page.evaluate(()=>window.messages.length)).toBe(0);
 await f.getByRole('button',{name:'Previous week',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 expect(await page.evaluate(()=>window.messages[0].content[0].text)).toContain('tracker-a');
 await f.getByRole('button',{name:'Current week',exact:true}).click();
 await expect(f.locator('#week-total')).toHaveText('650 kcal logged');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(2);
 expect(await f.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/dashboard-light-${width}.png`,fullPage:true});
 await page.evaluate(()=>window.sendToWidget('ui/notifications/host-context-changed',{theme:'dark'}));
 await expect(f.locator('html')).toHaveAttribute('data-theme','dark');
 await page.screenshot({path:`test-results/dashboard-${width}.png`,fullPage:true});
});
test('result-before-input, rerender, malicious text, zero, empty and fallback',async({page})=>{
 const s=todaySnapshot();s.tracker='<img src=x onerror=alert(1)>';s.days=s.days.map(d=>({...d,mealCount:0,kcal:null,protein:null,carbs:null,fat:null}));
 const f=await mount(page,{input:s,order:'result-first',messages:false});
 await expect(f.locator('#day-note')).toContainText('No meals logged');await expect(f.locator('#tracker img')).toHaveCount(0);
 await f.getByRole('button',{name:'Set protein target',exact:true}).click();await expect(f.locator('#fallback')).toBeVisible();
 const fresh=todaySnapshot();fresh.snapshotId='32345678-1234-4123-8123-123456789012';
 await page.evaluate(input=>{window.sendToWidget('ui/notifications/tool-input',{arguments:input});window.sendToWidget('ui/notifications/tool-result',{content:[],structuredContent:{accepted:true,snapshotId:input.snapshotId}});},fresh);
 await expect(f.locator('#nutrients tr')).toHaveCount(4);await expect(f.locator('#day-kcal')).toHaveText('650 kcal');
});
test('no input, partial input and cancellation never become accepted data',async({page})=>{
 const f=await mount(page,{input:null});await expect(f.locator('#dashboard')).toBeHidden();
 await page.evaluate(()=>window.sendToWidget('ui/notifications/tool-input-partial',{arguments:{tracker:'Incomplete'}}));
 await expect(f.locator('#dashboard')).toBeHidden();
 await page.evaluate(()=>window.sendToWidget('ui/notifications/tool-cancelled',{reason:'cancelled'}));await expect(f.locator('#status')).toContainText('cancelled');
});
test('invalid input and rejected follow-up are visible',async({page})=>{
 const f=await mount(page,{reject:true});await f.getByRole('button',{name:'Refresh from Sheet'}).click();await expect(f.locator('#fallback')).toBeVisible();
 await page.evaluate(()=>window.sendToWidget('ui/notifications/tool-input',{arguments:{}}));await expect(f.locator('#dashboard')).toBeHidden();await expect(f.locator('#status')).toContainText('invalid');
});

test('accepted acknowledgement cannot render mismatched input; errors and historical targets stay honest',async({page})=>{
 const input=todaySnapshot();input.focusDate='2025-12-29';input.periodStart=input.focusDate;input.days=[snapshot().days[0]];
 const f=await mount(page,{input:null});
 await page.evaluate(input=>{window.sendToWidget('ui/notifications/tool-input',{arguments:input});window.sendToWidget('ui/notifications/tool-result',{content:[],structuredContent:{accepted:true,snapshotId:'42345678-1234-4123-8123-123456789012'}});},input);
 await expect(f.locator('#dashboard')).toBeHidden();
 await page.evaluate(input=>window.sendToWidget('ui/notifications/tool-result',{content:[],structuredContent:{accepted:true,snapshotId:input.snapshotId}}),input);
 await expect(f.locator('#dashboard')).toBeVisible();await expect(f.locator('#nutrients')).not.toContainText('remaining');
 await page.evaluate(()=>window.sendToWidget('ui/notifications/tool-result',{content:[],isError:true}));
 await expect(f.locator('#dashboard')).toBeHidden();await expect(f.locator('#status')).toContainText('failed');
});

for(const width of [320,390,960])test(`compact Today, partial targets and view requests at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});const f=await mount(page,{input:todaySnapshot()});
 await expect(f.locator('#weekly-view')).toBeHidden();
 await expect(f.locator('#day-kcal')).toHaveText('650 kcal');
 await expect(f.locator('#nutrients')).toContainText('1,350 kcal remaining');
 await expect(f.locator('progress')).toHaveCount(3);
 await expect(f.getByRole('button',{name:'Set protein target',exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/today-light-${width}.png`,fullPage:true});
 await page.evaluate(()=>window.sendToWidget('ui/notifications/host-context-changed',{theme:'dark'}));
 await page.screenshot({path:`test-results/today-dark-${width}.png`,fullPage:true});
 await page.evaluate(()=>window.sendToWidget('ui/notifications/host-context-changed',{theme:'light'}));
 await f.getByRole('button',{name:'Need help setting targets?',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 expect(await page.evaluate(()=>window.messages[0].content[0].text)).toContain('wait for my acceptance');
 await f.getByRole('button',{name:'View weekly dashboard',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(2);
 expect(await page.evaluate(()=>window.messages[1].content[0].text)).toContain('Requested view weekly');
 await f.getByRole('button',{name:"Show today's meals",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(3);
 expect(await page.evaluate(()=>window.messages[2].content[0].text)).toContain('no render call is needed');
 expect(await f.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);

});
test('Sunday weeks stay local when loaded and view switching preserves the originating tracker',async({page})=>{
 const s=weeklySnapshot(0);const f=await mount(page,{input:s});
 await expect(f.locator('.day-label').first()).toHaveText('Sun');
 await f.getByRole('button',{name:'Previous week',exact:true}).click();
 expect(await page.evaluate(()=>window.messages.length)).toBe(0);
 await f.getByRole('button',{name:'Previous week',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 expect(await page.evaluate(()=>window.messages[0].content[0].text)).toContain('weekStartsOn 0');
 await f.getByRole('button',{name:'View Day So Far',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(2);
 const prompt=await page.evaluate(()=>window.messages[1].content[0].text);
 expect(prompt).toContain('tracker-a');expect(prompt).toContain(s.snapshotId);expect(prompt).toContain('Requested view today');
});
test('unset, zero, exceeded targets and unlogged days remain distinct',async({page})=>{
 const s=todaySnapshot();s.targets={kcal:0,protein:0,carbs:null,fat:10};
 const f=await mount(page,{input:s});
 await expect(f.locator('#nutrients')).toContainText('650 kcal above target');
 await expect(f.locator('progress')).toHaveCount(1);
 await expect(f.getByRole('button',{name:'Set carbohydrates target',exact:true})).toBeVisible();
 s.snapshotId='52345678-1234-4123-8123-123456789012';s.targets={kcal:null,protein:null,carbs:null,fat:null};
 s.days[0]={...s.days[0],mealCount:0,kcal:null,protein:null,carbs:null,fat:null};
 await page.evaluate(input=>{window.sendToWidget('ui/notifications/tool-input',{arguments:input});window.sendToWidget('ui/notifications/tool-result',{content:[],structuredContent:{accepted:true,snapshotId:input.snapshotId}});},s);
 await expect(f.locator('#nutrients button')).toHaveCount(4);await expect(f.locator('progress')).toHaveCount(0);
 await expect(f.locator('#day-kcal')).toHaveText('— kcal');await expect(f.locator('#day-note')).toContainText('intake is unknown');
});
test('legacy snapshot still renders Weekly without a second daily widget',async({page})=>{
 const f=await mount(page,{input:snapshot()});await expect(f.locator('#week-total')).toHaveText('650 kcal logged');
 await expect(f.locator('#today-view')).toBeHidden();
});

for(const order of ['input-first','result-first']) {
 test(`empty-day request renders unknown intake after normalization: ${order}`,async({page})=>{
  const input=emptyTodayRequest();delete input.today;delete input.periodStart;
  const f=await mount(page,{input,order});
  await expect(f.locator('#dashboard')).toBeVisible();await expect(f.locator('#day-kcal')).toHaveText('— kcal');
  await expect(f.locator('#day-note')).toContainText('intake is unknown');
  await expect(f.locator('#nutrients')).not.toContainText('remaining');
  await expect(f.locator('progress')).toHaveCount(0);
 });
 test(`midnight request preserves historical date without current-day comparisons: ${order}`,async({page})=>{
  const input=afterMidnightRequest();const f=await mount(page,{input,order});
  await expect(f.locator('#dashboard')).toBeVisible();await expect(f.locator('#day-kcal')).toHaveText('650 kcal');
  await expect(f.locator('#nutrients')).not.toContainText('remaining');
  await expect(f.locator('progress')).toHaveCount(0);
  await f.getByRole('button',{name:'Refresh from Sheet'}).click();
  await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
  const prompt=await page.evaluate(()=>window.messages[0].content[0].text);
  expect(prompt).toContain('2026-01-10');expect(prompt).toContain('tracker-a');
 });
}

for(const order of ['input-first','result-first'])test(`numeric meals render Day So Far and preserve backdated refresh: ${order}`,async({page})=>{
 const input=afterMidnightRequest();delete input.days;delete input.today;delete input.periodStart;
 input.meals=[{date:input.focusDate,kcal:400,protein:20,carbs:50,fat:13},{date:input.focusDate,kcal:500,protein:35,carbs:55,fat:17}];
 const f=await mount(page,{input,order});
 await expect(f.locator('#day-title')).toHaveText('Day So Far');
 await expect(f.locator('#day-kcal')).toHaveText('900 kcal');
 await expect(f.locator('#nutrients')).toContainText('55 g');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 expect(await page.evaluate(()=>window.messages[0].content[0].text)).toContain('2026-01-10');
 input.meals=[];input.snapshotId='62345678-1234-4123-8123-123456789012';
 await page.evaluate(input=>{window.sendToWidget('ui/notifications/tool-input',{arguments:input});window.sendToWidget('ui/notifications/tool-result',{structuredContent:{accepted:true,snapshotId:input.snapshotId},content:[]});},input);
 await expect(f.locator('#day-kcal')).toHaveText('— kcal');
 await expect(f.locator('#day-note')).toContainText('intake is unknown');
});

test('synthetic shared lunch then breakfast displays coherent Day So Far without losing originating tracker actions',async({page})=>{
 const scenario=sharedMealScenario(),input=todaySnapshot();delete input.days;
 input.meals=[{date:input.focusDate,...scenario.lunch}];
 const f=await mount(page,{input});
 await expect(f.locator('#day-kcal')).toHaveText('600 kcal');
 input.meals.push({date:input.focusDate,...scenario.breakfast});
 input.snapshotId='72345678-1234-4123-8123-123456789012';
 await page.evaluate(input=>{window.sendToWidget('ui/notifications/tool-input',{arguments:input});window.sendToWidget('ui/notifications/tool-result',{structuredContent:{accepted:true,snapshotId:input.snapshotId},content:[]});},input);
 await expect(f.locator('#day-kcal')).toHaveText('1,000 kcal');
 await expect(f.locator('#day-protein')).toHaveText('60 g');
 await expect(f.locator('#day-carbs')).toHaveText('115 g');
 await expect(f.locator('#day-fat')).toHaveText('33 g');
 await expect(f.locator('#day-note')).toContainText('2 meals logged');
 await f.getByRole('button',{name:'Refresh from Sheet'}).click();
 await expect.poll(()=>page.evaluate(()=>window.messages.length)).toBe(1);
 const prompt=await page.evaluate(()=>window.messages[0].content[0].text);
 expect(prompt).toContain(input.trackerRef);expect(prompt).toContain(input.snapshotId);expect(prompt).toContain(input.focusDate);
});

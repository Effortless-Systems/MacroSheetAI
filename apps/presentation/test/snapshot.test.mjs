import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,todaySnapshot,weeklySnapshot,emptyTodayRequest,afterMidnightRequest} from './fixture.mjs';
import {snapshotSchema,parseSnapshotRequest,summarizeWeek,weekStart,shiftDate} from '../src/snapshot.mjs';
test('valid snapshot preserves unknown, zero and current targets',()=>{
  const input=snapshot(); input.days[0]={...input.days[0],kcal:0,protein:0,carbs:0,fat:0};
  const parsed=snapshotSchema.parse(input);
  assert.equal(parsed.days[0].kcal,0); assert.equal(parsed.days[1].kcal,null);
  assert.equal(summarizeWeek(parsed.days.slice(7),parsed.today).kcal,650);
  assert.equal(summarizeWeek(parsed.days.slice(1,4),parsed.today).kcal,null);
});
test('reject incomplete coverage, malformed values, extra private fields and inconsistent dates',()=>{
  for(const edit of [s=>s.days.pop(),s=>s.days[1].date=s.days[0].date,s=>s.days[0].kcal=null,s=>s.days[1].kcal=0,s=>s.days[0].fat=-1,s=>s.days[0].protein=Infinity,s=>s.days[0].kcal='1',s=>s.days[0].description='private',s=>s.sheetId='private',s=>s.today='2026-02-30',s=>s.today='2026-01-09',s=>s.timezone='invalid',s=>s.focusDate='2026-01-11',s=>s.periodStart='2025-12-30',s=>s.targets.kcal=undefined,s=>s.days[13]={...s.days[0],date:'2026-01-11'}]) {
    const input=snapshot();edit(input);assert.equal(snapshotSchema.safeParse(input).success,false);
  }
});

test('separate one-day snapshot, historical day and read-time timezone agreement',()=>{
 const s=todaySnapshot();assert.equal(snapshotSchema.parse(s).days.length,1);
 s.today='2026-01-11';s.timezone='Pacific/Auckland';s.readAt='2026-01-10T12:00:00Z';
 assert.equal(snapshotSchema.parse(s).focusDate,'2026-01-10');
 s.focusDate='2026-01-09';s.periodStart=s.focusDate;s.days[0].date=s.focusDate;
 assert.equal(snapshotSchema.safeParse(s).success,true);
 for(const edit of [s=>s.days.push({...s.days[0]}),s=>s.view='weekly',s=>delete s.weekStartsOn,s=>delete s.view,s=>s.periodStart='2026-01-01',s=>s.weekStartsOn=7,s=>s.weekStartsOn=1.5]){
  const input=todaySnapshot();edit(input);assert.equal(snapshotSchema.safeParse(input).success,false);
 }
});
test('all seven week starts align across year boundaries and reject a different requested week',()=>{
 for(let firstDay=0;firstDay<7;firstDay++){
  const s=weeklySnapshot(firstDay);assert.equal(snapshotSchema.safeParse(s).success,true);
  assert.equal(new Date(`${s.periodStart}T00:00:00Z`).getUTCDay(),firstDay);
  assert.equal(weekStart(shiftDate(s.periodStart,6),firstDay),s.periodStart);
  s.focusDate=s.periodStart;assert.equal(snapshotSchema.safeParse(s).success,false);
 }
 assert.equal(weekStart('2026-01-01',0),'2025-12-28');
 assert.equal(weekStart('2026-01-01',1),'2025-12-29');
 const s=weeklySnapshot(0);s.weekStartsOn=1;assert.equal(snapshotSchema.safeParse(s).success,false);
});
test('v1 callers retain strict legacy semantics',()=>{
 const s=snapshot();assert.equal(snapshotSchema.safeParse(s).success,true);
 for(const extra of [{view:'today'},{weekStartsOn:0}])assert.equal(snapshotSchema.safeParse({...s,...extra}).success,false);
});
test('Today eliminates thirteen unnecessary render aggregates without echoing meal data',()=>{
 const today=JSON.stringify(todaySnapshot()),weekly=JSON.stringify(weeklySnapshot());
 assert.ok(today.length<weekly.length/2);
 assert.equal(JSON.parse(today).days.length,1);
});

test('malformed calendar fields return validation errors instead of throwing during date math',()=>{
 for(const field of ['periodStart','focusDate','today'])for(const value of ['not-a-date','2026-99-99','2026-02-30']){
  const s=weeklySnapshot();s[field]=value;
  assert.equal(snapshotSchema.safeParse(s).success,false);
 }
});

test('v2 request normalization repairs empty-day and midnight assembly errors without changing source evidence',()=>{
 const empty=emptyTodayRequest(),before=structuredClone(empty);
 const parsed=parseSnapshotRequest(empty);assert.equal(parsed.success,true);
 assert.equal(parsed.data.days[0].kcal,null);assert.equal(parsed.data.today,'2026-01-11');
 assert.deepEqual(empty,before);
 empty.days[0].fat=null;assert.equal(parseSnapshotRequest(empty).data.days[0].fat,null);
 const historical=afterMidnightRequest();
 const result=parseSnapshotRequest(historical);assert.equal(result.success,true);
 assert.equal(result.data.today,'2026-01-11');assert.equal(result.data.focusDate,'2026-01-10');
 assert.equal(result.data.days[0].kcal,650);assert.equal(historical.today,'2026-01-10');
 const zero=todaySnapshot();for(const key of ['kcal','protein','carbs','fat'])zero.days[0][key]=0;
 assert.equal(parseSnapshotRequest(zero).data.days[0].kcal,0);
});
test('v2 derives omitted dates for Today and all week starts; v1 still requires them',()=>{
 for(const input of [todaySnapshot(),...Array.from({length:7},(_,i)=>weeklySnapshot(i))]){
  const expected=input.periodStart;delete input.today;delete input.periodStart;
  const parsed=parseSnapshotRequest(input);assert.equal(parsed.success,true);
  assert.equal(parsed.data.periodStart,expected);assert.equal(parsed.data.today,'2026-01-10');
 }
 const legacy=snapshot();delete legacy.today;assert.equal(parseSnapshotRequest(legacy).success,false);
 const legacyZero=snapshot();legacyZero.days[1].kcal=0;assert.equal(parseSnapshotRequest(legacyZero).success,false);
});
test('normalization never discards positive nutrients, repairs coverage, or hides invalid input',()=>{
 for(const edit of [s=>s.days[0].kcal=1,s=>delete s.days[0].protein,s=>s.days[0].fat=-1,s=>s.timezone='invalid',s=>s.readAt='yesterday',s=>s.periodStart='invalid',s=>s.focusDate='2026-02-30',s=>s.weekStartsOn=7,s=>s.days[0].date='2026-01-09',s=>s.secret='private']){
  const s=emptyTodayRequest();edit(s);assert.equal(parseSnapshotRequest(s).success,false);
 }
 const bad=emptyTodayRequest();bad.days[0].kcal=1;
 const parsed=parseSnapshotRequest(bad);assert.equal(parsed.success,false);
 assert.ok(parsed.error.issues.some(i=>i.path.join('.')==='days.0.kcal'&&i.message.includes('No meals')));
 for(const value of [null,[],{},true,2,'invalid'])assert.equal(parseSnapshotRequest(value).success,false);
});

test('numeric meals aggregate unsorted dates across years, preserving missing and genuine zero',()=>{
 const input=weeklySnapshot();delete input.days;delete input.today;delete input.periodStart;
 input.meals=[{date:'2026-01-01',kcal:400,protein:20,carbs:50,fat:13},{date:'2025-12-31',kcal:0,protein:0,carbs:0,fat:0},{date:'2026-01-01',kcal:237,protein:11,carbs:11,fat:18}];
 const before=structuredClone(input), parsed=parseSnapshotRequest(input);
 assert.equal(parsed.success,true);assert.deepEqual(input,before);
 assert.equal(parsed.data.days.length,14);
 assert.deepEqual(parsed.data.days.find(d=>d.date==='2026-01-01'),{date:'2026-01-01',mealCount:2,kcal:637,protein:31,carbs:61,fat:31});
 assert.equal(parsed.data.days.find(d=>d.date==='2025-12-31').kcal,0);
 assert.equal(parsed.data.days.find(d=>d.date==='2026-01-02').kcal,null);
});
test('numeric meal input rejects wrong coverage, unknowns, private fields, overflows and truncation',()=>{
 const make=()=>{const input=todaySnapshot();delete input.days;input.meals=[{date:input.focusDate,kcal:100,protein:10,carbs:12,fat:4}];return input;};
 for(const edit of [s=>s.meals[0].date='2026-01-09',s=>s.meals[0].date='2026-01-11',s=>s.meals[0].date='invalid',s=>s.meals[0].kcal=null,s=>s.meals[0].entry_id='private',s=>s.meals[0].fat=-1,s=>s.version=1,s=>s.days=todaySnapshot().days,s=>s.meals=Array(201).fill(s.meals[0]),s=>s.meals=[{...s.meals[0],kcal:1e9},{...s.meals[0],kcal:1}]]){
  const input=make();edit(input);assert.equal(parseSnapshotRequest(input).success,false);
 }
 const empty=make();empty.meals=[];assert.equal(parseSnapshotRequest(empty).data.days[0].kcal,null);
 const missing=make();delete missing.meals;assert.equal(parseSnapshotRequest(missing).success,false);
});

test('analytics is an optional request control for both versions, never canonical display data',()=>{
 for(const input of [snapshot(),todaySnapshot(),weeklySnapshot()]) {
  for(const flag of [true,false,undefined]) {
   const request={...input,usageAnalytics:flag};
   const result=parseSnapshotRequest(request);
   assert.equal(result.success,true);
   assert.equal(Object.hasOwn(result.data,'usageAnalytics'),false);
   assert.deepEqual(result.data,input);
  }
  assert.equal(snapshotSchema.safeParse({...input,usageAnalytics:true}).success,false);
  for(const flag of ['true',1,null,{}])assert.equal(parseSnapshotRequest({...input,usageAnalytics:flag}).success,false);
 }
});

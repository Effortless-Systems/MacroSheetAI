// Data boundary tests. These do not exercise browser rendering or host tools.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const html = readFileSync(join(__dirname, '../experiments/macrosheet-presentation-probe/assets/dashboard.html'), 'utf8');
const model = html.match(/<script id="snapshot-model">([\s\S]*?)<\/script>/)[1];
const prepare = vm.runInNewContext(model + '; prepareSnapshot');
const input = () => ({
  tracker: 'Test tracker', timezone: 'UTC', readAt: '2026-01-10T12:00:00Z',
  today: '2026-01-10', focusDate: '2026-01-10', periodStart: '2025-12-29',
  targets: {kcal: 0, protein: null, carbs: null, fat: null},
  meals: [
    {id: 'test-a', date: '2026-01-10', kcal: 120, protein: 10, carbs: 12, fat: 4},
    {id: 'test-b', date: '2026-01-10', kcal: 90, protein: 5, carbs: 8, fat: 4},
    {id: 'test-zero', date: '2026-01-02', kcal: 0, protein: 0, carbs: 0, fat: 0}
  ]
});
test('template has no bundled data and no network/storage APIs', () => {
  assert.equal(JSON.parse(html.match(/id="snapshot-data">(.*?)<\/script>/s)[1]), null);
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/);
  assert.equal(prepare(null), null);
});
test('aggregate unsorted meals, preserve zero vs missing, and cover 14 dates', () => {
  const raw = input(), before = JSON.stringify(raw), result = prepare(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(result.weeks.length, 2);
  assert.equal(result.weeks.flat().length, 14);
  const day = result.weeks.flat().find(d => d.date === raw.focusDate);
  assert.equal(day.kcal, 210); assert.equal(day.protein, 15);
  assert.equal(day.carbs, 20); assert.equal(day.fat, 8);
  assert.equal(result.weeks[0][4].kcal, 0);
  assert.equal(result.weeks[0][0].kcal, null);
  assert.equal(result.targets.kcal, 0); assert.equal(result.targets.protein, null);
});
test('empty Sheet period stays unknown rather than zero', () => {
  const raw=input(); raw.meals=[];
  assert.ok(prepare(raw).weeks.flat().every(d => d.kcal === null));
});
test('duplicate, incomplete, invalid and out-of-period meals are rejected', () => {
  const edits = [
    r => r.meals.push({...r.meals[0]}),
    r => r.meals[0].protein = null,
    r => r.meals[0].kcal = '120',
    r => r.meals[0].kcal = Infinity,
    r => r.meals[0].fat = -1,
    r => r.meals[0].date = '2026-02-30',
    r => r.meals[0].date = '2026-01-12',
    r => r.meals[0].id = ''
  ];
  for (const edit of edits) { const raw=input(); edit(raw); assert.throws(() => prepare(raw)); }
});
test('metadata and targets must be complete and valid', () => {
  const edits = [
    r => r.focusDate = '2026-01-12', r => r.today = '2026-02-30',
    r => r.periodStart = '2025-12-30', r => r.timezone = 'Not/AZone',
    r => r.readAt = '', r => r.targets.fat = -1, r => delete r.targets.protein
  ];
  for (const edit of edits) { const raw=input(); edit(raw); assert.throws(() => prepare(raw)); }
});
test('new Sheet snapshot updates totals without changing template or prior snapshot', () => {
  const raw=input(), before=prepare(raw);
  raw.meals[0].kcal += 100; raw.meals[0].protein += 10;
  raw.readAt='2026-01-10T12:05:00Z';
  const after=prepare(raw);
  assert.equal(before.weeks[1][5].kcal, 210);
  assert.equal(after.weeks[1][5].kcal, 310);
  assert.equal(after.weeks[1][5].protein, 25);
  assert.notEqual(after.readAt, before.readAt);
});

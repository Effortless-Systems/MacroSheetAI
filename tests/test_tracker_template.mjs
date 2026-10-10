import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baseRequests,monthRequests,templateDefinition,literal,ids} from '../templates/tracker-v2.mjs';

test('published asset is reproducible, data-free and preserves literal types',()=>{
 const asset=JSON.parse(readFileSync(new URL('../plugins/macrosheet/skills/macrosheet/assets/tracker-template.json',import.meta.url)));
 assert.deepEqual(asset,templateDefinition());
 assert.equal(literal('=1').userEnteredValue.stringValue,'=1');
 assert.deepEqual(literal(0),{userEnteredValue:{numberValue:0}});
 assert.deepEqual(literal(false),{userEnteredValue:{boolValue:false}});
 assert.deepEqual(literal(''),{});
 const requests=baseRequests();
 const settings=requests.find(r=>r.updateCells?.start.sheetId===ids.settings && r.updateCells.start.rowIndex===1).updateCells.rows;
 const entered=settings.filter(r=>r.values[1].userEnteredValue).map(r=>r.values[0].userEnteredValue.stringValue);
 assert.deepEqual(entered,['product','schema_version','template_version']);
 assert.equal(requests.filter(r=>r.addSheet).length,5);
 assert.ok(!requests.some(r=>r.deleteSheet));
});

test('new month and capacity updates are one bounded batch without rewriting logs',()=>{
 const requests=monthRequests({month:'2026-01',slot:12,sheetId:200,rowCount:401,columnCount:10});
 assert.deepEqual(requests.filter(r=>r.appendDimension).map(r=>r.appendDimension.length),[1,31]);
 assert.equal(requests.find(r=>r.duplicateSheet).duplicateSheet.newSheetName,'Meals_2026_01');
 const updates=requests.filter(r=>r.updateCells).map(r=>r.updateCells);
 assert.ok(updates.every(r=>r.start.sheetId!==200));
 const index=updates.find(r=>r.start.sheetId===ids.index);
 assert.equal(index.start.rowIndex,13);
 assert.equal(index.rows[0].values[2].userEnteredValue.numberValue,374);
 const dashboard=updates.find(r=>r.start.sheetId===ids.dashboard);
 assert.match(JSON.stringify(dashboard),/\$A\$404/);
 assert.doesNotMatch(JSON.stringify(dashboard),/\$A\$373/);
 const recalc=monthRequests({month:'2026-01',slot:12,sheetId:200,rowCount:400,columnCount:10,create:false,capacity:13});
 assert.ok(recalc.every(r=>r.updateCells));
 assert.deepEqual(recalc.map(r=>r.updateCells.start.sheetId),[ids.index,ids.summary]);
});

test('packaged formula patterns reproduce exact anchors for arbitrary slots',()=>{
 for(const slot of [0,1,11,12,25]){
  const requests=monthRequests({month:'2024-02',slot,sheetId:200,capacity:26});
  const updates=requests.filter(r=>r.updateCells).map(r=>r.updateCells);
  const indexRow=slot+2,first=31*slot+2;
  const replace=s=>s.replaceAll('__INDEX_ROW__',indexRow).replaceAll('__SUMMARY_START__',first).replaceAll('__SUMMARY_END__',first+30);
  const recipe=templateDefinition().monthRecipe;
  const index=updates.find(r=>r.start.sheetId===ids.index);
  assert.deepEqual(index.rows[0].values.slice(5).map(c=>c.userEnteredValue.formulaValue),recipe.indexFormulaPatterns.map(replace));
  const summary=updates.find(r=>r.start.sheetId===ids.summary);
  assert.equal(summary.rows.length,31);
  assert.deepEqual(summary.rows[0].values.map(c=>c.userEnteredValue.formulaValue),recipe.summaryAnchorPatterns.map(replace));
  assert.ok(summary.rows.slice(1).every(r=>r.values.every(c=>!c.userEnteredValue)));
 }
});

test('invalid month and capacity inputs fail before producing mutation requests',()=>{
 for(const change of [{month:'2026-13'},{month:'2026-1'},{slot:-1},{slot:0.5},{sheetId:-1},{rowCount:1},{columnCount:8},{capacity:0}])
  assert.throws(()=>monthRequests({month:'2026-09',slot:0,sheetId:200,...change}));
});

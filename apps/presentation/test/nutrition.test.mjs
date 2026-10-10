import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculationSchema,calculateNutrition} from '../src/nutrition.mjs';
import {sharedMealScenario} from './fixture.mjs';
const calculate=input=>calculateNutrition(calculationSchema.parse(input));
test('shared arithmetic scales portions and preserves recorded calories separately from 4/4/9',()=>{
 const result=calculate({items:[{kcal:100,protein:10,carbs:10,fat:5,multiplier:0.5},{kcal:0,protein:0,carbs:0,fat:0}]});
 assert.deepEqual(result,{kcal:50,protein:5,carbs:5,fat:2.5,macroKcal:62.5,usedMacroEstimate:false});
 const estimated=calculate({items:[{kcal:null,protein:10,carbs:20,fat:5},{kcal:100,protein:10,carbs:10,fat:5}]});
 assert.equal(estimated.kcal,265);assert.equal(estimated.macroKcal,290);assert.equal(estimated.usedMacroEstimate,true);
});
test('invalid or unknown nutrition and overflowing calculations fail without clamping',()=>{
 const valid={kcal:1,protein:1,carbs:1,fat:1};
 for(const items of [[],Array(201).fill(valid),[{...valid,carbs:null}],[{...valid,multiplier:0}],[{...valid,kcal:Infinity}],[{...valid,fat:-1}],[{...valid,description:'private'}],[{...valid,kcal:1e9,multiplier:2}]]) assert.throws(()=>calculate({items}));
});
test('synthetic shared lunch scales both dishes once and later breakfast preserves recorded daily calories',()=>{
 const scenario=sharedMealScenario();
 const lunch=calculate({items:scenario.dishes});
 const total=calculate({items:[scenario.breakfast,scenario.lunch]});
 for(const key of ['kcal','protein','carbs','fat']) {
  assert.equal(lunch[key],scenario.lunch[key]);
  assert.equal(total[key],scenario.total[key]);
 }
 assert.equal(lunch.usedMacroEstimate,false);assert.equal(total.usedMacroEstimate,false);
 assert.notEqual(total.kcal,total.macroKcal);
});
test('saved recipe fixture scales batch yield and finished weight without replacing accepted calories',()=>{
 const requests=JSON.parse(readFileSync(new URL('../../../tests/fixtures/recipe-first-save.json',import.meta.url),'utf8'));
 const [headers,record]=requests[1].updateCells.rows.map(row=>row.values.map(cell=>Object.values(cell.userEnteredValue)[0]));
 const saved=Object.fromEntries(headers.map((key,index)=>[key,record[index]]));
 const batch=calculate({items:[{kcal:200,protein:10,carbs:20,fat:5},{kcal:400,protein:20,carbs:40,fat:10}]});
 const nutrients={kcal:saved.calories_kcal,protein:saved.protein_g,carbs:saved.carbs_g,fat:saved.fat_g};
 for(const key of ['kcal','protein','carbs','fat']) assert.equal(batch[key],nutrients[key]);
 assert.notEqual(batch.kcal,batch.macroKcal);
 const portion=calculate({items:[{...nutrients,multiplier:1.5/saved.servings}]});
 const grams=calculate({items:[{...nutrients,multiplier:100/saved.cooked_weight_g}]});
 for(const [key,value] of Object.entries({kcal:225,protein:11.25,carbs:22.5,fat:5.625})) assert.equal(portion[key],value);
 for(const [key,value] of Object.entries({kcal:120,protein:6,carbs:12,fat:3})) assert.equal(grams[key],value);
 assert.equal(portion.usedMacroEstimate,false);
});

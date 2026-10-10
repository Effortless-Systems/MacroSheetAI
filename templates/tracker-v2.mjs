// Native Google Sheets requests. This module has no network or credential access.
export const templateVersion = '2.0.0';
export const publicTemplateUrl = 'https://docs.google.com/spreadsheets/d/1FU0QHGFBaQdBdt0a81OkBqW68z7L-r8XH4s2etZqpp8/edit';
export const ids = { settings: 101, dashboard: 102, index: 103, summary: 104, blank: 105 };
export const mealHeaders = ['entry_id','local_date','description','calories_kcal','protein_g','carbs_g','fat_g','estimated','notes'];
export const summaryHeaders = ['local_date','meal_count','calories_kcal','protein_g','carbs_g','fat_g','protein_kcal','carbs_kcal','fat_kcal','status'];
export const indexHeaders = ['month','meal_tab','summary_start_row','source_rows','source_columns','status','meal_count','formula_cells','invalid_rows','duplicate_ids'];
export const settingsKeys = ['product','schema_version','timezone','calorie_target_kcal','protein_target_g','carbs_target_g','fat_target_g','person_name','created_local_date','week_starts_on','last_weekly_review_offer','template_version'];
export const literal = value => value === null || value === '' ? {} : {userEnteredValue:{[typeof value === 'number' ? 'numberValue' : typeof value === 'boolean' ? 'boolValue' : 'stringValue']:value}};
export const formula = value => ({userEnteredValue:{formulaValue:value}});
export const cells = (sheetId, rowIndex, rows, columnIndex=0) => ({updateCells:{start:{sheetId,rowIndex,columnIndex},rows:rows.map(values=>({values})),fields:'userEnteredValue'}});
const set = key => `INDEX(Settings!$B$2:$B$13,MATCH("${key}",Settings!$A$2:$A$13,0))`;
const range = (r, header) => `INDIRECT("'"&Month_Index!$B$${r}&"'!"&ADDRESS(2,MATCH("${header}",INDIRECT("'"&Month_Index!$B$${r}&"'!A1:"&ADDRESS(1,Month_Index!$E$${r},4)),0),4)&":"&ADDRESS(Month_Index!$D$${r},MATCH("${header}",INDIRECT("'"&Month_Index!$B$${r}&"'!A1:"&ADDRESS(1,Month_Index!$E$${r},4)),0),4))`;
const source = r => `INDIRECT("'"&$B${r}&"'!A2:"&ADDRESS($D${r},$E${r},4))`;
const headers = r => `INDIRECT("'"&$B${r}&"'!A1:"&ADDRESS(1,$E${r},4))`;

export function indexFormulas(r) {
  const col = h => `INDEX(raw,,MATCH("${h}",heads,0))`;
  // Formula metadata is inspected separately because a formula returning a valid
  // number is still forbidden in authoritative meal fields.
  const formulaCount = '='+mealHeaders.map(h=>`SUM(MAP(SEQUENCE($D${r}-1),LAMBDA(row_number,N(ISFORMULA(INDIRECT("'"&$B${r}&"'!"&ADDRESS(row_number+1,MATCH("${h}",${headers(r)},0),4)))))))`).join('+');
  const checks = [
    'ISTEXT(entry)', 'LEN(entry)>0', 'ISTEXT(day)',
    `IFERROR(TEXT(DATE(VALUE(LEFT(day,4)),VALUE(MID(day,6,2)),VALUE(RIGHT(day,2))),"yyyy-mm-dd")=day,FALSE)`,
    `LEFT(day,7)=$A${r}`, 'ISTEXT(description)', 'LEN(TRIM(description))>0',
    ...['kcal','protein','carbs','fat'].flatMap(n=>[`ISNUMBER(${n})`,`${n}>=0`,`${n}<=1000000000`]),
    'ISLOGICAL(estimated)', 'OR(note="",ISTEXT(note))'
  ].join(',');
  const invalid = `=LET(heads,${headers(r)},raw,${source(r)},entries,${col('entry_id')},dates,${col('local_date')},descriptions,${col('description')},calories,${col('calories_kcal')},proteins,${col('protein_g')},carbohydrates,${col('carbs_g')},fats,${col('fat_g')},estimates,${col('estimated')},notes,${col('notes')},SUM(MAP(entries,dates,descriptions,calories,proteins,carbohydrates,fats,estimates,notes,LAMBDA(entry,day,description,kcal,protein,carbs,fat,estimated,note,IF(AND(entry="",day="",description="",kcal="",protein="",carbs="",fat="",estimated="",note=""),0,IF(IFERROR(AND(${checks}),FALSE),0,1))))))`;
  const entries=range(r,'entry_id');
  return [
    `=IFERROR(IF(AND(${mealHeaders.map(h=>`COUNTIF(${headers(r)},"${h}")=1`).join(',')},$H${r}=0,$I${r}=0,$J${r}=0),"ok","invalid"),"invalid")`,
    `=COUNTIF(${entries},"<>")`, formulaCount, invalid,
    `=IF($G${r}=0,0,$G${r}-COUNTUNIQUE(FILTER(${entries},${entries}<>"")))`
  ];
}

export function summaryRows(indexRow, firstRow) {
  const endRow=firstRow+30, dates=`$A${firstRow}:$A${endRow}`, counts=`$B${firstRow}:$B${endRow}`;
  const base=`DATE(VALUE(LEFT(Month_Index!$A$${indexRow},4)),VALUE(RIGHT(Month_Index!$A$${indexRow},2)),1)`;
  const rows=Array.from({length:31},()=>Array.from({length:10},()=>literal('')));
  rows[0]=[
    formula(`=ARRAYFORMULA(IF(SEQUENCE(31)>DAY(EOMONTH(${base},0)),"",TEXT(${base}+SEQUENCE(31)-1,"yyyy-mm-dd")))`),
    formula(`=ARRAYFORMULA(IF(${dates}="","",IF(Month_Index!$F$${indexRow}<>"ok","",COUNTIF(${range(indexRow,'local_date')},${dates}))))`),
    ...['calories_kcal','protein_g','carbs_g','fat_g'].map(h=>formula(`=ARRAYFORMULA(IF(${dates}="","",IF(Month_Index!$F$${indexRow}<>"ok","",IF(${counts}=0,"",SUMIF(${range(indexRow,'local_date')},${dates},${range(indexRow,h)})))))`)),
    ...[['D',4],['E',4],['F',9]].map(([c,f])=>formula(`=ARRAYFORMULA(IF(${c}${firstRow}:${c}${endRow}="","",${c}${firstRow}:${c}${endRow}*${f}))`)),
    formula(`=ARRAYFORMULA(IF(${dates}="","",Month_Index!$F$${indexRow}))`)
  ];
  return rows;
}

export function sheetRequests(title, sheetId, rowCount, columnCount, header) {
  return [
    {addSheet:{properties:{sheetId,title,gridProperties:{rowCount,columnCount,frozenRowCount:1}}}},
    ...(header ? [cells(sheetId,0,[header.map(literal)])] : []),
    {repeatCell:{range:{sheetId},cell:{userEnteredFormat:{textFormat:{fontFamily:'Arial',fontSize:10},verticalAlignment:'MIDDLE'}},fields:'userEnteredFormat'}},
    {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:0.93,green:0.94,blue:0.93},textFormat:{bold:true,fontSize:10}}},fields:'userEnteredFormat(backgroundColor,textFormat)'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:columnCount},properties:{pixelSize:145},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:0,endIndex:1},properties:{pixelSize:38},fields:'pixelSize'}},
    {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{wrapStrategy:'WRAP'}},fields:'userEnteredFormat.wrapStrategy'}}
  ];
}

export function dashboardRows(capacity=12) {
  if(!Number.isInteger(capacity)||capacity<1)throw new Error('Invalid capacity');
  const summaryEnd=capacity*31+1;
  const rows=Array.from({length:40},()=>Array.from({length:10},()=>literal('')));
  const put=(r,values)=>rows[r-1]=values.map(v=>typeof v==='string'&&v.startsWith('=') ? formula(v):literal(v));
  put(1,['MacroSheet · Your intake, in view']);
  put(2,['Setup',`=IF(AND(${set('timezone')}<>"",ISNUMBER(${set('week_starts_on')}),${set('created_local_date')}<>""),"Ready","Finish setup in chat")`]);
  put(3,['Timezone',`=${set('timezone')}`]);
  put(4,['Today', '=IF($B$2<>"Ready","",TEXT(TODAY(),"yyyy-mm-dd"))']);
  put(5,['Week starts on',`=${set('week_starts_on')}`]);
  put(6,['Current week begins','=IF($B$2<>"Ready","",TEXT(TODAY()-MOD(WEEKDAY(TODAY(),1)-1-$B$5,7),"yyyy-mm-dd"))']);
  put(8,['No log means unknown intake. Targets are current; historical target comparisons are not available.']);
  const day=(r,date)=>{
    put(r,[date,...Array.from({length:8},(_,i)=>`=IF($A${r}="","",IF(COUNTIF(Daily_Summary!$A$2:$A$${summaryEnd},$A${r})=0,${i===0?'0':'""'},INDEX(Daily_Summary!$B$2:$I$${summaryEnd},MATCH($A${r},Daily_Summary!$A$2:$A$${summaryEnd},0),${i+1})))`),
      `=IF($A${r}="","",IF(COUNTIF(Daily_Summary!$A$2:$A$${summaryEnd},$A${r})=0,"unregistered",INDEX(Daily_Summary!$J$2:$J$${summaryEnd},MATCH($A${r},Daily_Summary!$A$2:$A$${summaryEnd},0))))`]);
  };
  put(10,['Day So Far']);put(11,summaryHeaders);day(12,'=$B$4');
  put(14,['Current targets','calories_kcal','protein_g','carbs_g','fat_g']);
  put(15,['',...['calorie_target_kcal','protein_target_g','carbs_target_g','fat_target_g'].map(k=>`=IF(${set(k)}="","",${set(k)})`)]);
  for (const [heading,first,offset] of [[17,19,0],[29,31,-7]]) {
    put(heading,[offset===0?'Current week':'Last week']);put(first-1,summaryHeaders);
    for(let d=0;d<7;d++)day(first+d,`=IF($B$6="","",TEXT(DATEVALUE($B$6)+${offset+d},"yyyy-mm-dd"))`);
    const last=first+6;
    put(last+2,['Logged days',`=IF(COUNTIF(J${first}:J${last},"invalid")>0,"",COUNTIF(B${first}:B${last},">0"))`,'Recorded kcal',`=IF(OR(B${last+2}="",B${last+2}=0),"",SUM(C${first}:C${last}))`,'Kcal per logged day',`=IF(OR(B${last+2}="",B${last+2}=0),"",D${last+2}/B${last+2})`]);
  }
  return rows;
}

export function baseRequests() {
  const requests=[{updateSpreadsheetProperties:{properties:{locale:'en_US',timeZone:'Etc/UTC',autoRecalc:'MINUTE'},fields:'locale,timeZone,autoRecalc'}}];
  for(const [name,key,nr,nc,header] of [['Dashboard','dashboard',40,10,null],['Settings','settings',20,2,['key','value']],['Month_Index','index',13,10,indexHeaders],['Daily_Summary','summary',373,10,summaryHeaders],['_Month_Template','blank',201,9,mealHeaders]])requests.push(...sheetRequests(name,ids[key],nr,nc,header));
  requests.push(cells(ids.settings,1,settingsKeys.map(k=>[literal(k),literal(k==='product'?'macrosheet':k==='schema_version'?2:k==='template_version'?templateVersion:'')])));
  requests.push(cells(ids.dashboard,0,dashboardRows()));
  for(const r of [9,16,28])requests.push({repeatCell:{range:{sheetId:ids.dashboard,startRowIndex:r,endRowIndex:r+1},cell:{userEnteredFormat:{backgroundColor:{red:0.88,green:0.93,blue:0.88},textFormat:{bold:true,fontSize:12}}},fields:'userEnteredFormat(backgroundColor,textFormat)'}});
  for(const r of [10,17,29])requests.push({repeatCell:{range:{sheetId:ids.dashboard,startRowIndex:r,endRowIndex:r+1},cell:{userEnteredFormat:{textFormat:{bold:true},wrapStrategy:'WRAP'}},fields:'userEnteredFormat(textFormat,wrapStrategy)'}});
  requests.push({updateDimensionProperties:{range:{sheetId:ids.settings,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{pixelSize:235},fields:'pixelSize'}});
  requests.push({updateDimensionProperties:{range:{sheetId:ids.blank,dimension:'COLUMNS',startIndex:2,endIndex:3},properties:{pixelSize:310},fields:'pixelSize'}});
  requests.push({updateDimensionProperties:{range:{sheetId:ids.blank,dimension:'COLUMNS',startIndex:8,endIndex:9},properties:{pixelSize:310},fields:'pixelSize'}});
  for(const r of [0,7,9,16,28])requests.push({mergeCells:{range:{sheetId:ids.dashboard,startRowIndex:r,endRowIndex:r+1,startColumnIndex:0,endColumnIndex:10},mergeType:'MERGE_ALL'}});
  requests.push({repeatCell:{range:{sheetId:ids.dashboard,startRowIndex:7,endRowIndex:8},cell:{userEnteredFormat:{wrapStrategy:'WRAP'}},fields:'userEnteredFormat.wrapStrategy'}});
  for(const sheetId of [ids.summary,ids.index,ids.dashboard])requests.push({addProtectedRange:{protectedRange:{range:{sheetId},description:'Derived MacroSheet formulas. Editing may disable summary reads.',warningOnly:true}}});
  requests.push({updateSheetProperties:{properties:{sheetId:ids.blank,hidden:true},fields:'hidden'}});
  return requests;
}

export function monthRequests({month,slot,sheetId,rowCount=201,columnCount=9,create=true,capacity=12}) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(slot) || slot<0 || !Number.isInteger(sheetId) || sheetId<0 || !Number.isInteger(rowCount)||rowCount<2||!Number.isInteger(columnCount)||columnCount<9||!Number.isInteger(capacity)||capacity<1)throw new Error('Invalid month or bounds');
  const title='Meals_'+month.replace('-','_'), indexRow=slot+2, firstRow=slot*31+2;
  const requests=[];
  if(slot>=capacity) {
    const growth=slot+1-capacity;
    requests.push({appendDimension:{sheetId:ids.index,dimension:'ROWS',length:growth}},
      {appendDimension:{sheetId:ids.summary,dimension:'ROWS',length:growth*31}},
      cells(ids.dashboard,0,dashboardRows(slot+1)));
  }
  if(create)requests.push({duplicateSheet:{sourceSheetId:ids.blank,newSheetId:sheetId,newSheetName:title}},{updateSheetProperties:{properties:{sheetId,hidden:false,gridProperties:{rowCount,columnCount}},fields:'hidden,gridProperties(rowCount,columnCount)'}});
  // Registry, summary capacity and dashboard bounds grow in the same batch.
  if(create)requests.push({updateSheetProperties:{properties:{sheetId:ids.dashboard,index:0},fields:'index'}});
  requests.push(cells(ids.index,indexRow-1,[[month,title,firstRow,rowCount,columnCount].map(literal).concat(indexFormulas(indexRow).map(formula))]));
  requests.push(cells(ids.summary,firstRow-1,summaryRows(indexRow,firstRow)));
  return requests;
}

export function templateDefinition() {
  return {product:'macrosheet',schemaVersion:2,templateVersion,publicTemplateUrl,
    description:'Data-free native Google Sheets template. Prefer whole-workbook copy; use requests only on a new empty workbook. Initialize timezone/settings and register the current month after copying.',
    sheetIds:ids,baseRequests:baseRequests(),monthRecipe:{month:'YYYY-MM',slot:'zero-based unused index slot',initialCapacity:12,defaultRows:201,
      instructions:'Duplicate _Month_Template; write one Month_Index row and 31 Daily_Summary rows using the formula patterns below. Substitute __INDEX_ROW__, __SUMMARY_START__ and __SUMMARY_END__ with the selected numeric rows. Beyond capacity, append one registry row and 31 summary rows per additional slot, and change ALL Dashboard Daily_Summary lookup end rows from the verified old bound to 31*newCapacity+1 in the SAME batch. Never scan or rewrite historical meal rows.',
      indexFormulaPatterns:indexFormulas(987654).map(s=>s.replaceAll('987654','__INDEX_ROW__')),
      summaryAnchorPatterns:summaryRows(987654,876543)[0].map(c=>c.userEnteredValue.formulaValue.replaceAll('987654','__INDEX_ROW__').replaceAll('876573','__SUMMARY_END__').replaceAll('876543','__SUMMARY_START__'))}};
}

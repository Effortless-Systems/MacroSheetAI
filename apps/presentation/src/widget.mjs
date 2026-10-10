import { App } from '@modelcontextprotocol/ext-apps';
import { macroCalories } from './nutrition.mjs';
import { parseSnapshotRequest, snapshotSchema, shiftDate, weekStart, summarizeWeek, viewOf, firstDayOf } from './snapshot.mjs';

const app = new App({ name: 'MacroSheet', version: '0.8.0' }, {}, { autoResize: true });
const $ = id => document.getElementById(id);
const number = value => value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const label = (value, options = {day:'numeric',month:'short'}) => new Intl.DateTimeFormat(undefined,{...options,timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
const element = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node; };
let input, acceptedId, resultSnapshot, data, start, pending=false, cancelled=false;
const status = text => { $('status').textContent=text; $('status').hidden=false; };
function unavailable(message) { clearTimeout(timer); $('dashboard').hidden=true; input=undefined; acceptedId=undefined; resultSnapshot=undefined; data=undefined; status(message); }
function theme(context) { document.documentElement.dataset.theme=context?.theme==='dark'?'dark':'light'; }
function ready() {
  const snapshot=resultSnapshot??input;
  if (cancelled) return;
  if (!snapshot || acceptedId !== snapshot.snapshotId) {
    data=undefined; $('dashboard').hidden=true;
    status('Waiting for a complete, accepted summary…');
    return;
  }
  if (input && resultSnapshot && JSON.stringify(input)!==JSON.stringify(resultSnapshot)) {
    clearTimeout(timer); data=undefined; $('dashboard').hidden=true;
    status('The dashboard input and result conflict. Ask chat to check the snapshot before retrying.');
    return;
  }
  clearTimeout(timer); data=snapshot; start=weekStart(data.focusDate,firstDayOf(data));
  $('status').hidden=true; $('dashboard').hidden=false; $('followup').hidden=true;
  $('tracker').textContent=data.tracker;
  const todayView=viewOf(data)==='today';
  $('today-view').hidden=!todayView; $('weekly-view').hidden=todayView;
  if(todayView) renderDay(); else renderWeek();
  $('source').textContent=`Read ${new Date(data.readAt).toLocaleString(undefined,{timeZone:data.timezone})} · ${data.timezone}`;
}
function renderDay() {
  const current=data.focusDate===data.today;
  $('day-title').textContent='Day So Far';
  $('day-date').textContent=label(data.focusDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const day=data.days.find(day=>day.date===data.focusDate);
  $('day-note').textContent=day.mealCount===0?'No meals logged for this date; intake is unknown.':`${day.mealCount} ${day.mealCount===1?'meal':'meals'} logged; intake may be incomplete.`;
  $('nutrients').replaceChildren();
  for(const [key,title] of [['kcal','Calories'],['protein','Protein'],['carbs','Carbohydrates'],['fat','Fat']]) {
    const row=element('tr'), name=element('th',title,key), amount=element('td',`${number(day[key])} ${key==='kcal'?'kcal':'g'}`), goal=element('td');
    name.scope='row';
    if(key==='carbs') {name.textContent='';name.append(element('span','Carbohydrates','full-name'),element('span','Carbs','short-name'));name.setAttribute('aria-label','Carbohydrates');}
    amount.id=`day-${key}`;
    goal.append(target(key,day[key],title)); row.append(name,amount,goal); $('nutrients').append(row);
  }
  $('target-help').textContent=Object.values(data.targets).some(v=>v===null)?'Need help setting targets?':'Review targets';
  $('meals').textContent=current?"Show today's meals":'Show meals for this day';
}
function target(key,value,name) {
  if(data.targets[key]===null) {
    const button=element('button','Set target','target');
    button.setAttribute('aria-label',`Set ${name.toLowerCase()} target`);
    button.onclick=()=>send(`Help me set the ${name.toLowerCase()} target for this tracker. Offer to use a value I have or guide me if I do not know. Save only explicitly supplied or accepted values and verify.`,{view:'today',date:data.focusDate});
    return button;
  }
  const unit=key==='kcal'?'kcal':'g', total=data.targets[key], box=element('div',undefined,'target-value');
  box.append(element('span',`${number(total)} ${unit}`));
  if(value!==null && data.focusDate===data.today) {
    box.append(element('span',value<=total?`${number(total-value)} ${unit} remaining`:`${number(value-total)} ${unit} above target`,'note'));
    if(total>0) {
      const progress=element('progress');progress.max=total;progress.value=Math.min(value,total);
      progress.setAttribute('aria-label',`${name}: ${number(value)} of ${number(total)} ${unit}`);box.append(progress);
    }
  } else box.append(element('span','Current setting','note'));
  return box;
}

function renderWeek() {
  const days=data.days.filter(day=>day.date>=start&&day.date<=shiftDate(start,6));
  const totals=summarizeWeek(days,data.today);
  $('week-range').textContent=`${label(start)} – ${label(shiftDate(start,6),{day:'numeric',month:'short',year:'numeric'})}`;
  $('week-total').textContent=totals.kcal===null?'No meals logged':`${number(totals.kcal)} kcal logged`;
  $('week-average').textContent=totals.logged?`${number(totals.kcal/totals.logged)} kcal per logged day`:'';
  $('coverage').textContent=`${totals.logged} of ${totals.elapsed} elapsed days with logs${start===weekStart(data.today,firstDayOf(data))?' · today is partial':''}. Missing logs do not mean zero intake.`;
  const macros=[['protein',4],['carbs',4],['fat',9]];
  const ceiling=Math.max(500,Math.ceil(Math.max(...data.days.map(d=>macroCalories({protein:d.protein??0,carbs:d.carbs??0,fat:d.fat??0})))/500)*500);
  $('chart').replaceChildren(); $('daily-values').replaceChildren();
  for(const day of days) {
    const col=element('div',undefined,'day'), space=element('div',undefined,'bar-space');
    if(day.mealCount===0) space.append(element('div',day.date>data.today?'Future':'No log','empty'));
    else {
      const total=macroCalories(day), stack=element('div',undefined,'stack');
      stack.style.height=`${total/ceiling*100}%`;
      for(const [key,factor] of macros) {const segment=element('div',undefined,`segment ${key}`); segment.style.height=`${total?day[key]*factor/total*100:0}%`; stack.append(segment);}
      space.append(stack);
    }
    col.append(space,element('div',label(day.date,{weekday:'short'}),'day-label')); $('chart').append(col);
    const row=element('div',undefined,'daily-row');
    row.append(element('strong',label(day.date)),element('span',`${number(day.kcal)} kcal · P ${number(day.protein)} · C ${number(day.carbs)} · F ${number(day.fat)} g`));
    $('daily-values').append(row);
  }
  $('next').disabled=start>=weekStart(data.today,firstDayOf(data));
  $('current').disabled=start===weekStart(data.today,firstDayOf(data));
}
async function send(action, {view=viewOf(data),date=data.focusDate,requestedStart=start}={}) {
  if(pending || !data) return;
  const period=view==='weekly'?`Requested week ${requestedStart} through ${shiftDate(requestedStart,6)}; weekStartsOn ${firstDayOf(data)}.`:`Requested day ${date}.`;
  const prompt=`MacroSheet tracker reference ${data.trackerRef}, snapshot ${data.snapshotId}. Resolve this reference from the originating conversation; if unavailable or ambiguous, ask for the original tracker link/access. Never substitute another tracker. Requested view ${view}. ${period} ${action}`;
  pending=true; $('followup').hidden=false; $('fallback').hidden=true;
  const buttons=[...document.querySelectorAll('button')].map(button=>[button,button.disabled]);
  for(const [button] of buttons) button.disabled=true;
  $('dashboard').setAttribute('aria-busy','true');
  $('followup-status').textContent='Sending your request to chat…';
  try {
    const capabilities=app.getHostCapabilities();
    if(!capabilities?.message) throw new Error('Messages unavailable');
    const result=await app.sendMessage({ role:'user',content:[{type:'text',text:prompt}] },{timeout:10000});
    if(result.isError) throw new Error('Message rejected');
    $('followup-status').textContent='Requested in chat. This card remains the earlier snapshot until a fresh view arrives.';
  } catch {
    $('followup-status').textContent='Send this request in chat to continue:';
    $('fallback').textContent=prompt; $('fallback').hidden=false;
  } finally {
    pending=false;
    for(const [button,disabled] of buttons) if(button.isConnected) button.disabled=disabled;
    $('dashboard').removeAttribute('aria-busy');
  }
}
function navigate(next) {
  if(!data || pending) return;
  if(next>=data.periodStart && shiftDate(next,6)<=shiftDate(data.periodStart,13)) {start=next;renderWeek();}
  else void send('Show this week with its preceding week. Read any missing coverage from the same Sheet.',{view:'weekly',requestedStart:next});
}
$('previous').onclick=()=>navigate(shiftDate(start,-7));
$('next').onclick=()=>navigate(shiftDate(start,7));
$('current').onclick=()=>navigate(weekStart(data.today,firstDayOf(data)));
$('show-today').onclick=()=>send('Show Day So Far for the current local date in this tracker. Reuse complete validated data from this interaction if still current; otherwise read the required date.',{view:'today',date:data.today});
$('show-weekly').onclick=()=>send('Show the separate weekly dashboard. Reuse complete validated data from this interaction or read missing coverage.',{view:'weekly'});
$('meals').onclick=()=>send('Show the logged meals for this date in chat. Reuse complete validated diary rows when current; no render call is needed.',{view:'today',date:data.focusDate});
$('target-help').onclick=()=>send('Help me choose or review targets in normal chat. Explain calories, protein, carbohydrates and fat. Reuse accepted targets and ask only for missing context. Propose values before saving and wait for my acceptance.',{view:'today',date:data.focusDate});
$('refresh').onclick=()=>send('Refresh this view from Sheets with complete reads and current settings. Preserve the selected consumed date for Day So Far, including a backdated meal day. Use the current date only when I explicitly request today. For Weekly preserve the requested week. Use a new read timestamp and snapshotId.');
app.ontoolinputpartial=()=>{ if(!data) status('Receiving your Sheet summary…'); };
app.ontoolinput=({arguments: args})=>{
  const parsed=parseSnapshotRequest(args);
  if(!parsed.success) return unavailable('This summary is incomplete or invalid. Ask chat to check the dashboard input and show a text summary if it cannot be corrected.');
  if(data && parsed.data.snapshotId!==data.snapshotId) {
    acceptedId=undefined; resultSnapshot=undefined; data=undefined;
    $('dashboard').hidden=true; status('Preparing your dashboard…');
  }
  input=parsed.data; ready();
};
app.ontoolresult=result=>{
  if(result.isError || result.structuredContent?.accepted!==true) return unavailable('The dashboard request failed. Ask chat to check the tool error before retrying; a new Sheet read may not be needed.');
  resultSnapshot=undefined;
  if(result._meta && Object.hasOwn(result._meta,'macrosheet/snapshot')) {
    const parsed=snapshotSchema.safeParse(result._meta['macrosheet/snapshot']);
    if(!parsed.success || parsed.data.snapshotId!==result.structuredContent.snapshotId) return unavailable('The dashboard result is invalid or has a conflicting snapshot identity. Ask chat to check the tool result.');
    resultSnapshot=parsed.data;
  }
  acceptedId=result.structuredContent.snapshotId; ready();
};
app.ontoolcancelled=()=>{cancelled=true;unavailable('Dashboard request cancelled.');};
app.onhostcontextchanged=theme;
app.onerror=()=>{if(!data) status('The widget connection failed. Ask chat for a text summary or retry.');};
const timer=setTimeout(()=>{if(!data) status('No complete summary received. Ask chat to retry or show a text summary.');},15000);
void app.connect().then(() => theme(app.getHostContext())).catch(() => unavailable('Inline widgets are unavailable here. Ask chat for a text summary.'));
window.addEventListener('pagehide',()=>{clearTimeout(timer);void app.close();},{once:true});

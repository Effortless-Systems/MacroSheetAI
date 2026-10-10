import {shiftDate,weekStart} from '../src/snapshot.mjs';

// Synthetic regression scenario, not values from a personal meal record.
export const sharedMealScenario = () => ({
 dishes:[{kcal:700,protein:40,carbs:80,fat:25,multiplier:0.5},{kcal:500,protein:30,carbs:60,fat:15,multiplier:0.5}],
 lunch:{kcal:600,protein:35,carbs:70,fat:20},
 breakfast:{kcal:400,protein:25,carbs:45,fat:13},
 total:{kcal:1000,protein:60,carbs:115,fat:33}
});
export const snapshot = () => ({ version:1,snapshotId:'12345678-1234-4123-8123-123456789012',tracker:'Test tracker',trackerRef:'tracker-a',timezone:'UTC',today:'2026-01-10',focusDate:'2026-01-10',periodStart:'2025-12-29',readAt:'2026-01-10T12:00:00Z',targets:{kcal:2000,protein:null,carbs:250,fat:70},days:Array.from({length:14},(_,i)=>({date:shiftDate('2025-12-29',i),mealCount:i===0||i===12?1:0,kcal:i===0?500:i===12?650:null,protein:i===0||i===12?30:null,carbs:i===0||i===12?50:null,fat:i===0||i===12?20:null})) });

export function todaySnapshot() {
 const s=snapshot();
 return {...s,version:2,view:'today',weekStartsOn:1,periodStart:s.focusDate,days:s.days.filter(d=>d.date===s.focusDate)};
}
export function weeklySnapshot(firstDay=1) {
 const s=snapshot(), periodStart=shiftDate(weekStart(s.focusDate,firstDay),-7);
 const days=Array.from({length:14},(_,i)=>{
  const date=shiftDate(periodStart,i),logged=i===0||date===s.focusDate;
  return {date,mealCount:logged?1:0,kcal:logged?(i===0?500:650):null,protein:logged?30:null,carbs:logged?50:null,fat:logged?20:null};
 });
 return {...s,version:2,view:'weekly',weekStartsOn:firstDay,periodStart,days};
}

// Synthetic reproductions of real request-assembly failures, with no tracker data.
export function emptyTodayRequest() {
 const s=todaySnapshot();
 return {...s,timezone:'Asia/Singapore',readAt:'2026-01-11T00:21:00+08:00',today:'2026-01-11',focusDate:'2026-01-11',periodStart:'2026-01-11',days:[{date:'2026-01-11',mealCount:0,kcal:0,protein:0,carbs:0,fat:0}]};
}
export function afterMidnightRequest() {
 return {...todaySnapshot(),timezone:'Asia/Singapore',readAt:'2026-01-11T00:20:00+08:00'};
}

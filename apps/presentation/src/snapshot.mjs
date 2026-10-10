import { z } from 'zod';
import { amount, nutrientShape, sumNutrients } from './nutrition.mjs';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
});
const macros = { kcal: amount.nullable(), protein: amount.nullable(), carbs: amount.nullable(), fat: amount.nullable() };
export const fields = Object.keys(macros);
export const shiftDate = (value, offset) => {
  const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export const weekStart = (value, firstDay = 1) => shiftDate(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() - firstDay + 7) % 7));
export const viewOf = data => data.version === 1 ? 'weekly' : data.view;
export const firstDayOf = data => data.version === 1 ? 1 : data.weekStartsOn;
const localDate = (readAt, timezone) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(readAt));
  const part = key => parts.find(p => p.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const snapshotFields = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  view: z.enum(['today', 'weekly']).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  snapshotId: z.string().uuid(),
  tracker: z.string().trim().min(1).max(100),
  trackerRef: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  today: date.describe('Current local date at readAt, not the requested historical day. Derived for version 2; omit it.'),
  focusDate: date.describe('Requested review date in the tracker timezone. Preserve historical requests.'),
  periodStart: date.describe('Derived for version 2; omit it. Today uses focusDate; Weekly starts seven days before its week start.'),
  readAt: z.string().datetime({ offset: true }).describe('Actual verified source-read completion timestamp with UTC offset. Never invent a fresh read time.'),
  targets: z.object(macros).strict(),
  days: z.array(z.object({ date, mealCount: z.number().int().min(0).max(100000), ...macros }).strict()).min(1).max(14).describe('Today: one requested day. Weekly: fourteen consecutive days, previous week then requested week. No meals: count 0 and all nutrients null. Logged meals: all nutrients numeric, including genuine zeros.')
}).strict();
export const snapshotSchema = snapshotFields.superRefine((data, ctx) => {
  // Field refinements already report invalid dates; do not perform calendar math on them.
  if (!date.safeParse(data.periodStart).success || !date.safeParse(data.focusDate).success) return;
  const fail = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (data.version === 1 && (data.view !== undefined || data.weekStartsOn !== undefined)) fail(['version'], 'Version 1 must omit view and weekStartsOn.');
  if (data.version === 2 && data.view === undefined) fail(['view'], 'Version 2 requires today or weekly.');
  if (data.version === 2 && data.weekStartsOn === undefined) fail(['weekStartsOn'], 'Version 2 requires the preferred week start, 0 through 6.');
  if (data.focusDate > data.today) fail(['focusDate'], 'Requested review date must not be after the local source-read date.');
  if (viewOf(data) === 'today') {
    if (data.days.length !== 1) fail(['days'], 'Today requires exactly one aggregate for focusDate.');
    if (data.periodStart !== data.focusDate) fail(['periodStart'], 'Today periodStart must equal focusDate.');
  } else {
    if (data.days.length !== 14) fail(['days'], 'Weekly requires fourteen consecutive days: the preceding week and requested week.');
    if (weekStart(data.periodStart, firstDayOf(data)) !== data.periodStart) fail(['periodStart'], 'Weekly periodStart must align with weekStartsOn.');
    if (data.focusDate < data.periodStart || data.focusDate > shiftDate(data.periodStart, 13)) fail(['focusDate'], 'Requested review date must be within the supplied coverage.');
    if (data.version === 2 && data.periodStart !== shiftDate(weekStart(data.focusDate, firstDayOf(data)), -7)) fail(['periodStart'], 'Version 2 Weekly coverage starts seven days before the requested week.');
  }
  try {
    if (localDate(data.readAt, data.timezone) !== data.today) fail(['today'], 'today must be the local date of readAt in timezone; keep a historical date in focusDate.');
  } catch { fail(['readAt'], 'readAt and timezone must identify a valid local source-read date.'); }
  data.days.forEach((day, i) => {
    if (day.date !== shiftDate(data.periodStart, i)) fail(['days', i, 'date'], 'Dates must be consecutive from the derived periodStart; preserve complete coverage.');
    for (const key of fields) if (day.mealCount === 0 ? day[key] !== null : day[key] === null) fail(['days', i, key], 'No meals requires null nutrients; logged meals require numeric nutrients. Check the aggregate without changing source records.');
    if (day.date > data.today && day.mealCount !== 0) fail(['days', i, 'mealCount'], 'Future dates cannot contain logged meals in a review. Resolve the source-date conflict.');
  });
});

// Share normalization for server results and legacy widget inputs.
export function normalizeSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { usageAnalytics, ...data } = input;
  if (data.version !== 2) return data;
  try { data.today = localDate(data.readAt, data.timezone); } catch { /* Validation reports malformed fields. */ }
  if (date.safeParse(data.focusDate).success) {
    if (data.view === 'today') data.periodStart = data.focusDate;
    else if (data.view === 'weekly' && Number.isInteger(data.weekStartsOn) && data.weekStartsOn >= 0 && data.weekStartsOn <= 6) data.periodStart = shiftDate(weekStart(data.focusDate, data.weekStartsOn), -7);
  }
  if (Array.isArray(data.meals) && data.days === undefined && date.safeParse(data.periodStart).success) {
    data.days = Array.from({ length: data.view === 'today' ? 1 : 14 }, (_, i) => {
      const dayDate = shiftDate(data.periodStart, i), rows = data.meals.filter(row => row.date === dayDate);
      return { date: dayDate, mealCount: rows.length, ...(rows.length ? sumNutrients(rows) : Object.fromEntries(fields.map(key => [key, null]))) };
    });
    delete data.meals;
  }
  if (Array.isArray(data.days)) data.days = data.days.map(day => {
    if (day?.mealCount !== 0 || !fields.every(key => day[key] === 0 || day[key] === null)) return day;
    return { ...day, ...Object.fromEntries(fields.map(key => [key, null])) };
  });
  return data;
}
// Keep a Zod object at the tool boundary for SDK JSON-schema discovery. Validate
// supplied fields first; only v2 may omit redundant, deterministically derived dates.
export const snapshotRequestSchema = snapshotFields.partial({ today: true, periodStart: true, days: true }).extend({
  usageAnalytics: z.boolean().optional().describe('Optional usage telemetry control, separate from the snapshot. Send true only after privacy disclosure and honoring the user preference; omitted or false disables custom analytics. No identity or location values belong in arguments.'),
  meals: z.array(z.object({ date, ...nutrientShape }).strict()).max(200).optional().describe('Preferred v2 input: complete verified numeric meal values for the requested period, without IDs or text. JavaScript computes counts/totals and empty days. Supply meals OR days, never both. An empty array means complete coverage with no meals.')
}).superRefine((input, ctx) => {
  if (input.meals !== undefined && (input.version !== 2 || input.days !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['meals'], message: 'Numeric meal input is v2 only and must replace days, not accompany it.' });
    return;
  }
  const normalized = normalizeSnapshot(input);
  if (input.meals && date.safeParse(normalized.periodStart).success) {
    const end = shiftDate(normalized.periodStart, input.view === 'today' ? 0 : 13);
    input.meals.forEach((meal, i) => {
      if (meal.date < normalized.periodStart || meal.date > end || meal.date > normalized.today) ctx.addIssue({ code: 'custom', path: ['meals', i, 'date'], message: 'Every meal must belong to the requested period and be no later than the local read date. Do not silently drop records.' });
    });
  }
  const parsed = snapshotSchema.safeParse(normalized);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue(issue);
});
export function parseSnapshotRequest(input) {
  const parsed = snapshotRequestSchema.safeParse(input);
  return parsed.success ? snapshotSchema.safeParse(normalizeSnapshot(parsed.data)) : parsed;
}
export function summarizeWeek(days, today) {
  const logged = days.filter(day => day.mealCount > 0);
  return { kcal: logged.length ? logged.reduce((sum, day) => sum + day.kcal, 0) : null,
    logged: logged.length, elapsed: days.filter(day => day.date <= today).length };
}

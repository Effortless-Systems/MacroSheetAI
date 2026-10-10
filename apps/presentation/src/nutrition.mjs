import { z } from 'zod';

export const amount = z.number().finite().nonnegative().max(1e9);
export const nutrientFields = ['kcal', 'protein', 'carbs', 'fat'];
export const nutrientShape = Object.fromEntries(nutrientFields.map(key => [key, amount]));
export const macroCalories = ({ protein, carbs, fat }) => protein * 4 + carbs * 4 + fat * 9;
export const sumNutrients = rows => Object.fromEntries(nutrientFields.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));

export const calculationSchema = z.object({
  items: z.array(z.object({
    ...nutrientShape,
    kcal: amount.nullable().describe('Preserve supplied/label calories. Use null only to estimate missing calories from complete macros using 4/4/9.'),
    multiplier: z.number().finite().positive().max(1e6).optional().describe('Portion multiplier, default 1. Applies to all four nutrients.')
  }).strict()).min(1).max(200)
}).strict();
export const calculationResultSchema = z.object({
  ...nutrientShape, macroKcal: amount, usedMacroEstimate: z.boolean()
}).strict();

export function calculateNutrition({ items }) {
  const scaled = items.map(item => {
    const source = { ...item, kcal: item.kcal ?? macroCalories(item) };
    return Object.fromEntries(nutrientFields.map(key => [key, source[key] * (item.multiplier ?? 1)]));
  });
  const totals = sumNutrients(scaled);
  return calculationResultSchema.parse({ ...totals, macroKcal: macroCalories(totals), usedMacroEstimate: items.some(item => item.kcal === null) });
}

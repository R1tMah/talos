// Soft range checks shared by the agent and (later) the manual forms. A value that
// trips one is never silently saved or rejected: the owner gets "are you sure?".
// Hard limits (negative values, bad enums) live in the database constraints.

export const LIMITS = {
  weightMin: 90,
  weightMax: 400,
  weightJump: 10, // lb from the previous weigh-in
  foodCalories: 3000,
  foodProtein: 300,
  leetcodeMinutes: 180,
  portions: 10,
};

export function weightWarnings(lb: number, previous: number | null): string[] {
  const out: string[] = [];
  if (lb < LIMITS.weightMin || lb > LIMITS.weightMax) out.push(`${lb} lb is outside ${LIMITS.weightMin}–${LIMITS.weightMax} lb.`);
  else if (previous != null && Math.abs(lb - previous) > LIMITS.weightJump)
    out.push(`${lb} lb is ${Math.abs(lb - previous).toFixed(1)} lb from your last weigh-in (${previous} lb).`);
  return out;
}

export function foodWarnings(calories: number, protein: number): string[] {
  const out: string[] = [];
  if (calories > LIMITS.foodCalories) out.push(`${calories} cal is over ${LIMITS.foodCalories} for one entry.`);
  if (protein > LIMITS.foodProtein) out.push(`${protein} g protein is over ${LIMITS.foodProtein} g for one entry.`);
  return out;
}

export function portionWarnings(portions: number): string[] {
  return portions > LIMITS.portions ? [`${portions} portions is a lot for one entry.`] : [];
}

export function leetcodeWarnings(minutes: number | null): string[] {
  return minutes != null && minutes > LIMITS.leetcodeMinutes ? [`${minutes} minutes is over ${LIMITS.leetcodeMinutes}.`] : [];
}

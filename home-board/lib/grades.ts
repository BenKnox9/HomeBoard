export const GRADES = [
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
  "V12",
  "V12+",
] as const;

export type Grade = (typeof GRADES)[number];

export function gradeIndex(grade: string): number {
  const idx = GRADES.indexOf(grade as Grade);
  return idx === -1 ? 0 : idx;
}

export function gradeBadgeColor(grade: string): string {
  const idx = gradeIndex(grade);
  if (idx <= 2) return "#22c55e"; // V0–V2: green
  if (idx <= 5) return "#3b82f6"; // V3–V5: blue
  if (idx <= 8) return "#f59e0b"; // V6–V8: amber
  if (idx <= 11) return "#f97316"; // V9–V11: orange
  return "#ef4444"; // V12, V12+: red
}

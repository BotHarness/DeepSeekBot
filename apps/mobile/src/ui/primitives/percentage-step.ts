export function percentageStep(value: number, step: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value / step) * step));
}

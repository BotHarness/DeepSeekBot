export const METER_FLOOR_DBFS = -80;

export function levelDbfs(samples: ArrayLike<number>): number {
  if (samples.length === 0) return -120;
  let mean = 0;
  for (let index = 0; index < samples.length; index += 1) mean += samples[index]!;
  mean /= samples.length;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]! - mean;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms <= 1e-6 ? -120 : Math.max(-120, 20 * Math.log10(rms));
}

export function meterFraction(dbfs: number, floor = METER_FLOOR_DBFS): number {
  if (!Number.isFinite(dbfs)) return 0;
  return Math.min(1, Math.max(0, (dbfs - floor) / -floor));
}

export function smoothLevel(
  previous: number,
  target: number,
  attack = 0.6,
  release = 0.12,
): number {
  const rate = target > previous ? attack : release;
  const next = previous + (target - previous) * rate;
  return Math.abs(next - target) < 0.001 ? target : next;
}

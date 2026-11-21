export interface StandingLimits {
  soul: number;
  coreMemory: number;
}

export const DEFAULT_STANDING_LIMITS: StandingLimits = { soul: 5_000, coreMemory: 3_000 };
export const MIN_STANDING_LIMIT = 500;
export const MAX_STANDING_LIMIT = 50_000;

export function isStandingLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_STANDING_LIMIT &&
    value <= MAX_STANDING_LIMIT
  );
}

export function isStandingLimits(value: unknown): value is StandingLimits {
  return (
    typeof value === 'object' &&
    value !== null &&
    'soul' in value &&
    'coreMemory' in value &&
    isStandingLimit(value.soul) &&
    isStandingLimit(value.coreMemory)
  );
}

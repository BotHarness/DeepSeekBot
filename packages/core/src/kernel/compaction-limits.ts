export const MAX_CACHE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
export const COMPACTION_THRESHOLD_RATIO = { defaultValue: 0.8, min: 0.5, max: 0.95 };
export const COMPACTION_HEADROOM_TOKENS = { defaultValue: 65_536, min: 8_192, max: 262_144 };

export const PROMPT_LIMITS = [
  { id: 'group-context-chars', group: 'inbox', defaultValue: 24_000, min: 2_000, max: 200_000 },
  { id: 'dm-context-chars', group: 'inbox', defaultValue: 8_000, min: 1_000, max: 100_000 },
  { id: 'context-message-chars', group: 'inbox', defaultValue: 1_000, min: 200, max: 20_000 },
  { id: 'review-timeout-seconds', group: 'review', defaultValue: 60, min: 10, max: 600 },
  { id: 'review-human-messages', group: 'review', defaultValue: 8, min: 1, max: 50 },
  { id: 'review-human-message-chars', group: 'review', defaultValue: 1_500, min: 200, max: 20_000 },
  { id: 'review-tool-calls', group: 'review', defaultValue: 12, min: 1, max: 100 },
] as const;

export type PromptLimitId = (typeof PROMPT_LIMITS)[number]['id'];
export type PromptLimitValues = Partial<Record<PromptLimitId, number>>;
export type PromptLimits = Record<PromptLimitId, number>;
export type PromptLimitEdits = Partial<Record<PromptLimitId, number | null>>;

const BY_ID = new Map<string, (typeof PROMPT_LIMITS)[number]>(
  PROMPT_LIMITS.map((limit) => [limit.id, limit]),
);

export function isPromptLimitId(value: unknown): value is PromptLimitId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function validPromptLimit(id: PromptLimitId, value: unknown): value is number {
  const limit = BY_ID.get(id)!;
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= limit.min && value <= limit.max
  );
}

export const DEFAULT_PROMPT_LIMITS: PromptLimits = Object.fromEntries(
  PROMPT_LIMITS.map((limit) => [limit.id, limit.defaultValue]),
) as PromptLimits;

export function parsePromptLimitValues(value: unknown): PromptLimitValues {
  const values: PromptLimitValues = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return values;
  for (const [id, entry] of Object.entries(value))
    if (isPromptLimitId(id) && validPromptLimit(id, entry)) values[id] = entry;
  return values;
}

export function parsePromptLimitEdits(value: unknown): PromptLimitEdits | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const edits: PromptLimitEdits = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isPromptLimitId(id)) return undefined;
    if (entry === null) edits[id] = null;
    else if (validPromptLimit(id, entry)) edits[id] = entry;
    else return undefined;
  }
  return edits;
}

export function applyPromptLimitEdits(
  current: PromptLimitValues,
  edits: PromptLimitEdits,
): PromptLimitValues {
  const next: PromptLimitValues = { ...current };
  for (const [id, value] of Object.entries(edits) as Array<[PromptLimitId, number | null]>) {
    if (value === null) delete next[id];
    else next[id] = value;
  }
  return next;
}

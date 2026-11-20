import { expect, it, vi } from 'vitest';
import { readProfileActivity } from '../src/profile-activity';
import { HostAnswerInvalid } from '../src/host-answer';

const day = '2026-11-20';
const totals = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 };
const activity = {
  slug: 'tea',
  since: '2026-11-13T00:00:00Z',
  today: day,
  weeks: 1,
  memoryCommits: [{ day, count: 1 }],
  events: [{ day, count: 1, reason: 'human-dm' }],
  tokens: [{ day, ...totals }],
  tokenTotals: totals,
};
const model = {
  day,
  ...totals,
  totalTokens: null,
  purpose: 'orchestrator',
  provider: 'p',
  model: 'm',
};
const compaction = {
  botSlug: 'tea',
  provider: 'p',
  model: 'm',
  at: day + 'T00:00:00Z',
  idleGapMs: 1000,
  cacheLifetimeMs: 100,
  cacheLifetimeSource: 'catalog',
  tokensBefore: 2,
  tokensAfter: 1,
  inputTokens: 2,
  cacheReadTokens: null,
  outputTokens: 1,
  outcome: 'compacted',
};
const read = (value: unknown) =>
  readProfileActivity({ call: vi.fn().mockResolvedValue(value) }, { channelId: 'dm-tea' });

it('reads activity with absent or valid optional fields', async () => {
  await expect(read(activity)).resolves.toEqual(activity);
  const enriched = {
    ...activity,
    before: day,
    createdDay: day,
    modelUsageRows: [{ ...model, partial: true }],
    modelUsageStatus: 'ready',
    idleCompactions: [compaction],
  };
  await expect(read(enriched)).resolves.toEqual(enriched);
});

it.each([
  { weeks: 0 },
  { before: false },
  { createdDay: 'bad' },
  { tokenTotals: { ...totals, outputTokens: null } },
  { events: [{ day, count: 1 }] },
  { tokens: [{ day, ...totals, inputTokens: -1 }] },
  { modelUsageRows: [{ ...model, partial: 1 }] },
  { modelUsageRows: [{ ...model, totalTokens: '3' }] },
  { modelUsageStatus: false },
  { idleCompactions: [{ ...compaction, error: null }] },
  { idleCompactions: [{ ...compaction, cacheLifetimeSource: 'bad' }] },
])('rejects a malformed activity answer %j', async (change) => {
  await expect(read({ ...activity, ...change })).rejects.toBeInstanceOf(HostAnswerInvalid);
});

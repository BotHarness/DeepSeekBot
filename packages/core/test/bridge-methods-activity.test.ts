import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryService } from '../src/memory/service.js';
import { type UsageProjection } from '../src/usage/usage.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('queries the same versioned Host activity used by the stream', () => {
    const { registry, states, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    states.setSessionState('ada', 'owned', 'thinking');
    const first = methods.activitySnapshot({});
    expect(first).toMatchObject({
      ok: true,
      value: { revision: 1, bots: [{ slug: 'ada', state: 'thinking' }] },
    });
    states.setSessionState('ada', 'owned', 'working');
    const second = methods.activitySnapshot({});
    expect(second).toMatchObject({
      ok: true,
      value: { revision: 2, bots: [{ slug: 'ada', state: 'working' }] },
    });
    expect(first.ok && first.value.generation).toBe(second.ok && second.value.generation);
  });

  it('keeps the same reported lower bound in Profile and Overview usage', async () => {
    const usage = {
      activity: () => [
        {
          day: '2026-10-17',
          purpose: 'orchestrator',
          provider: 'deepseek',
          model: 'flash',
          inputTokens: 67711,
          outputTokens: 3040,
          cacheReadTokens: 603904,
          cacheWriteTokens: 0,
          totalTokens: null,
          reportedTotalTokens: 674655,
          unknownBuckets: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 1,
            cacheWriteTokens: 2,
          },
        },
      ],
    } as unknown as UsageProjection;
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      usage,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const result = await methods.profileActivity({ channelId: dm.id });
    expect(result.ok && result.value.modelUsageRows[0]).toMatchObject({
      totalTokens: 674655,
      partial: true,
    });
  });

  it('buckets Profile activity by Host-local day with reasons and Memory commits', async () => {
    const localDayOf = (at: string): string => {
      const date = new Date(at);
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };
    const atHour = (offsetDays: number, hour: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    const today = localDayOf(atHour(0, 10));
    const yesterday = localDayOf(atHour(-1, 10));
    const observed = [
      { at: atHour(-1, 9), reason: 'human-dm' },
      { at: atHour(0, 8), reason: 'group-mention' },
      { at: atHour(0, 12), reason: 'human-dm' },
    ];
    const memory = {
      activity: () => [{ at: atHour(-1, 9) }, { at: atHour(-1, 15) }, { at: atHour(0, 9) }],
    } as unknown as MemoryService;
    const usage = {
      activity: () => [
        {
          day: today,
          purpose: 'orchestrator',
          provider: 'deepseek',
          model: 'deepseek-chat',
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 10,
          cacheWriteTokens: 5,
        },
      ],
    } as unknown as UsageProjection;
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      memory,
      usage,
    );
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    channels.admissionActivity = (slug, sinceIso) =>
      slug === 'ada' ? observed.filter((entry) => entry.at >= sinceIso) : [];
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });

    const result = await methods.profileActivity({ channelId: dm.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('ada');
    expect(result.value.weeks).toBe(26);
    expect(result.value.today).toBe(today);
    expect(result.value.events).toEqual([
      { day: yesterday, reason: 'human-dm', count: 1 },
      { day: today, reason: 'group-mention', count: 1 },
      { day: today, reason: 'human-dm', count: 1 },
    ]);
    expect(result.value.memoryCommits).toEqual([
      { day: yesterday, count: 2 },
      { day: today, count: 1 },
    ]);
    expect(result.value.tokens).toEqual([
      {
        day: today,
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
    ]);
    expect(result.value.tokenTotals).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });

    expect(result.value.createdDay).toBe(localDayOf(registry.get('ada')!.createdAt));

    const older = await methods.profileActivity({
      channelId: dm.id,
      before: today,
      weeks: 4,
    });
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.value).toMatchObject({ before: today, weeks: 4 });
    expect(older.value.events).toEqual([{ day: yesterday, reason: 'human-dm', count: 1 }]);
    expect(older.value.memoryCommits).toEqual([{ day: yesterday, count: 2 }]);
    expect(older.value.tokens).toEqual([]);
    for (const window of [
      { before: '2026/10/01' },
      { before: 20261001 },
      { weeks: 0 },
      { weeks: 105 },
      { weeks: 1.5 },
    ])
      expect((await methods.profileActivity({ channelId: dm.id, ...window })).ok).toBe(false);

    expect(await methods.profileActivity({ channelId: group.id })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'Memory is available only in a PersonaBot DM',
      },
    });
    expect(await methods.profileActivity({ channelId: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: missing' },
    });
  });
});

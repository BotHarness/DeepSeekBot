import { afterEach, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
};
afterEach(() => vi.useRealTimers());
it('projects today committed messages and current sender names without changing Human attention', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  const core = createCore({ dshHome: createTempRoot('bh-channel-today-'), agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    core.channels.setHumanNickname(dm.id, 'Captain');
    for (const [id, author, body] of [
      ['human', { kind: 'human' }, 'Hello'],
      ['bot', { kind: 'bot', slug: 'ada' }, 'Ready'],
      ['system', { kind: 'system' }, 'Notice'],
    ] as const)
      await core.channels.appendMessage(dm.id, {
        id,
        author,
        body,
        at: new Date().toISOString(),
        ...(author.kind === 'system'
          ? {
              memberDeparture: {
                memberKind: 'bot' as const,
                memberId: 'past',
                displayName: 'Past',
              },
            }
          : {}),
      });
    const before = core.humanAttention.status();
    const result = createBridgeMethods({ ...core }).channelActivityToday({});
    expect(result).toMatchObject({
      ok: true,
      value: {
        day: '2026-10-02',
        total: 3,
        channels: [
          {
            channelId: dm.id,
            total: 3,
            human: 1,
            bot: 1,
            other: 1,
            senders: expect.arrayContaining([
              { author: { kind: 'human' }, displayName: 'Captain', count: 1 },
              { author: { kind: 'bot', slug: 'ada' }, displayName: 'Ada', count: 1 },
              { author: { kind: 'system' }, displayName: 'System', count: 1 },
            ]),
          },
        ],
      },
    });
    expect(core.humanAttention.status()).toEqual(before);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('uses local day bounds, counts once beyond a page, excludes inaccessible Channels and survives restart', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  const home = createTempRoot('bh-channel-today-restart-');
  let core = createCore({ dshHome: home, agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
    const empty = core.channels.createGroup({ name: 'Empty', members: [] });
    const yesterday = new Date(2026, 9, 2).getTime() - 1;
    const tomorrow = new Date(2026, 9, 3).toISOString();
    for (let n = 0; n < 205; n++)
      await core.channels.appendMessage(group.id, {
        id: 'today-' + n,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Update',
      });
    await core.channels.appendMessageOnce(group.id, {
      id: 'many-recipients',
      at: new Date(2026, 9, 2).toISOString(),
      author: { kind: 'human' },
      body: '@Ada @Bea',
      mentions: [
        { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
        { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
      ],
    });
    await core.channels.appendMessageOnce(group.id, {
      id: 'many-recipients',
      at: new Date(2026, 9, 2).toISOString(),
      author: { kind: 'human' },
      body: '@Ada @Bea',
      mentions: [
        { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
        { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
      ],
    });
    for (const [id, at] of [
      ['old', new Date(yesterday).toISOString()],
      ['next', tomorrow],
    ])
      await core.channels.appendMessage(group.id, {
        id: id!,
        at: at!,
        author: { kind: 'bot', slug: 'ada' },
        body: 'Outside day',
      });
    core.channels.getOrCreateDm('ada', 'Ada');
    const hidden = core.channels.getOrCreateBotDm('ada', 'bea', 'Private Bots')!;
    await core.channels.appendMessage(hidden.id, {
      id: 'private',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Bot private',
      botCausation: { rootSourceEventId: 'qa-root', parentSourceEventId: 'qa-parent', hop: 1 },
    });
    const deleted = core.channels.createGroup({ name: 'Deleted', members: [] });
    await core.channels.appendMessage(deleted.id, {
      id: 'deleted',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Gone',
    });
    core.channels.deleteGroup(deleted.id);
    core.registry.update('ada', { displayName: 'Ada renamed' });
    const methods = createBridgeMethods({ ...core });
    expect(methods.channelActivityToday({})).toMatchObject({
      ok: true,
      value: {
        total: 206,
        channels: [
          {
            channelId: group.id,
            total: 206,
            human: 1,
            bot: 205,
            other: 0,
            senders: expect.arrayContaining([
              { author: { kind: 'bot', slug: 'ada' }, displayName: 'Ada renamed', count: 205 },
            ]),
          },
          { channelId: 'dm-ada', total: 0, senders: [] },
          { channelId: empty.id, total: 0, senders: [] },
        ],
      },
    });
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome: home, agents });
    expect(createBridgeMethods({ ...core }).channelActivityToday({})).toMatchObject({
      ok: true,
      value: { total: 206 },
    });
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    expect(createBridgeMethods({ ...core }).channelActivityToday({})).toMatchObject({
      ok: true,
      value: { day: '2026-10-03', total: 1 },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('respects Human membership and visible revisions for current-day history', async () => {
  const { attachOperationalModule } = await import('../src/database/owner.js');
  const core = createCore({ dshHome: createTempRoot('bh-channel-visible-'), agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
    const hidden = core.channels.createGroup({
      name: 'Private Group',
      members: ['ada'],
      ownerBotSlug: 'ada',
    });
    const visibleAt = Date.now() - 10000;
    for (const id of ['before-join', 'visible'])
      await core.channels.appendMessage(group.id, {
        id,
        at: new Date(id === 'visible' ? visibleAt : visibleAt + 1000).toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Update',
      });
    await core.channels.appendMessage(hidden.id, {
      id: 'private',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Private',
    });
    attachOperationalModule(core.operationalDatabase, 'channels').transaction((db) => {
      db.prepare(
        'UPDATE channel_human_members SET visible_from_revision = 2 WHERE channel_id = ?',
      ).run(group.id);
      db.prepare('UPDATE channel_human_members SET left_at = ? WHERE channel_id = ?').run(
        new Date().toISOString(),
        hidden.id,
      );
    });
    expect(core.channels.latestBotActivity?.().get('ada')).toBe(visibleAt);
    expect(createBridgeMethods({ ...core }).channelActivityToday({})).toMatchObject({
      ok: true,
      value: { total: 1, channels: [{ channelId: group.id, total: 1 }] },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('retains each Bot activity after interleaved group messages and restart, including Assignment reports', async () => {
  const home = createTempRoot('bh-home-recency-');
  let core = createCore({ dshHome: home, agents });
  const adaAt = Date.parse('2026-10-18T10:00:00.123Z');
  const beaAt = adaAt + 1000;
  try {
    for (const slug of ['ada', 'bea', 'report-only'])
      core.registry.create({ slug, displayName: slug });
    const group = core.channels.createGroup({ name: 'Activity', members: ['ada', 'bea'] });
    for (const [slug, at] of [
      ['ada', adaAt],
      ['bea', beaAt],
    ] as const)
      await core.channels.appendMessage(group.id, {
        id: slug,
        author: { kind: 'bot', slug },
        body: 'Done',
        at: new Date(at).toISOString(),
      });
    await core.channels.appendMessage(group.id, {
      id: 'human',
      author: { kind: 'human' },
      body: 'Thanks',
      at: new Date(beaAt + 1000).toISOString(),
    });
    const expected = new Map([
      ['ada', adaAt],
      ['bea', beaAt],
    ]);
    expect(core.channels.latestBotActivity?.()).toEqual(expected);
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome: home, agents });
    expect(core.channels.latestBotActivity?.()).toEqual(expected);
    const reports = vi
      .spyOn(core.runtime, 'latestAssignmentActivity')
      .mockReturnValue(new Map([['report-only', beaAt + 2000]]));
    const result = createBridgeMethods({ ...core }).list({});
    expect(result).toMatchObject({
      ok: true,
      value: {
        bots: expect.arrayContaining([
          expect.objectContaining({ slug: 'ada', lastActivityAt: adaAt }),
          expect.objectContaining({ slug: 'bea', lastActivityAt: beaAt }),
          expect.objectContaining({ slug: 'report-only', lastActivityAt: beaAt + 2000 }),
        ]),
      },
    });
    reports.mockRestore();
    core.channels.deleteGroup(group.id);
    expect(core.channels.latestBotActivity?.()).toEqual(new Map());
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

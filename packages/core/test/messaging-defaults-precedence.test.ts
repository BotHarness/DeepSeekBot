import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { expect, it } from 'vitest';
import { externalMemberWake, type MessagingDefaults } from '../src/messaging/defaults.js';
import type { ChannelRecord } from '../src/channels/channel.js';
import type { BotSourcePolicy } from '../src/runtime/source-policy.js';
it.each(['feishu', 'slack', 'discord'] as const)(
  '%s resolves external ordinary wake per member without replacing local defaults',
  (platform) => {
    const defaults: MessagingDefaults = {
      platform,
      collection: 'all',
      wake: 'digest',
      count: 2,
      intervalSeconds: 120,
      identityEnabled: true,
      revision: 4,
      changedAt: '2026-10-03T00:00:00Z',
    };
    const channel: ChannelRecord = {
      id: 'team',
      type: 'group',
      name: 'Team',
      members: ['one', 'two'],
      createdAt: '',
      updatedAt: '',
      wakePolicies: { two: { mode: 'silent', count: 8, intervalSeconds: 60, revision: 3 } },
    };
    const rule: BotSourcePolicy = {
      sourceClass: 'group-ordinary',
      admission: 'admit',
      wake: 'digest',
      delivery: 'turn',
      digestCount: 7,
      digestIntervalSeconds: 20,
      revision: 2,
      lastActor: { kind: 'human' },
      changedAt: '',
      overrideActive: true,
      recentWakeCount: 0,
    };
    expect(externalMemberWake(channel, 'one', undefined, defaults)).toEqual({
      policy: { mode: 'digest', count: 2, intervalSeconds: 120, revision: 0 },
      origin: 'platform',
      defaultRevision: 4,
    });
    expect(externalMemberWake(channel, 'one', rule, defaults).policy.count).toBe(7);
    expect(externalMemberWake(channel, 'one', rule, defaults).origin).toBe('bot');
    expect(externalMemberWake(channel, 'two', rule, defaults).policy.mode).toBe('silent');
    expect(externalMemberWake(channel, 'two', rule, defaults).origin).toBe('channel');
    expect(
      externalMemberWake(
        channel,
        'one',
        { ...rule, overrideActive: false },
        { ...defaults, wake: 'immediate' },
      ).policy.mode,
    ).toBe('all');
    expect(channel.wakePolicies!.two!.revision).toBe(3);
  },
);

it('restores Channel inheritance through the owning store without losing prior admissions or revision monotonicity', async () => {
  const core = createCore({
    dshHome: createTempRoot('defaults-channel-reset-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const channel = core.channels.createGroup({ name: 'Team', members: ['ada'] });
    const custom = { mode: 'digest' as const, count: 2, intervalSeconds: 120 };
    core.channels.setGroupWakePolicy(channel.id, 'ada', custom);
    expect(core.channels.get(channel.id)!.wakePolicies!.ada!.revision).toBe(1);
    core.channels.setGroupWakePolicy(channel.id, 'ada', { ...custom, inherit: true });
    expect(core.channels.get(channel.id)!.wakePolicies!.ada).toBeUndefined();
    expect(core.channels.getGroupWakePolicy(channel.id, 'ada').count).toBe(5);
    core.channels.setGroupWakePolicy(channel.id, 'ada', custom);
    expect(core.channels.get(channel.id)!.wakePolicies!.ada!.revision).toBe(3);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it("keeps a Bot's explicit only-direct-mention default as a ceiling a Channel cannot raise", () => {
  const defaults: MessagingDefaults<'qq'> = {
    platform: 'qq',
    collection: 'all',
    wake: 'immediate',
    count: 5,
    intervalSeconds: 30,
    identityEnabled: true,
    revision: 1,
    changedAt: '',
  };
  const channel: ChannelRecord = {
    id: 'qq-group',
    type: 'group',
    name: 'QQ group',
    members: ['loud', 'quiet'],
    createdAt: '',
    updatedAt: '',
    wakePolicies: {
      loud: { mode: 'all', count: 1, intervalSeconds: 0, revision: 2 },
      quiet: { mode: 'silent', count: 1, intervalSeconds: 0, revision: 3 },
    },
  };
  const mentionsOnly: BotSourcePolicy = {
    sourceClass: 'group-ordinary',
    admission: 'admit',
    wake: 'mentions',
    delivery: 'turn',
    revision: 5,
    lastActor: { kind: 'human' },
    changedAt: '',
    overrideActive: true,
    recentWakeCount: 0,
  };
  expect(externalMemberWake(channel, 'loud', mentionsOnly, defaults)).toMatchObject({
    policy: { mode: 'mentions' },
    origin: 'bot',
  });
  expect(externalMemberWake(channel, 'quiet', mentionsOnly, defaults)).toMatchObject({
    policy: { mode: 'silent', revision: 3 },
    origin: 'channel',
  });
  expect(
    externalMemberWake(channel, 'loud', { ...mentionsOnly, overrideActive: false }, defaults).policy
      .mode,
  ).toBe('all');
});

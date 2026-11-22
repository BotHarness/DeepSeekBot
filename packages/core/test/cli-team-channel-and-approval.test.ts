import { describe, expect, it } from 'vitest';
import { host, run } from './cli-team-fixtures.js';

describe('M4 CLI parity', () => {
  const cases = [
    {
      args: ['channels', 'member-candidates', 'group-1'],
      method: 'channelMemberCandidates',
      payload: { channelId: 'group-1' },
    },
    {
      args: ['channels', 'member-candidates', 'group-1', '--query', 'Alice'],
      method: 'channelMemberCandidates',
      payload: { channelId: 'group-1', query: 'Alice' },
    },
    {
      args: ['channels', 'admins', 'group-1', '--set', 'alice,bob'],
      method: 'channelAdminsSet',
      payload: { channelId: 'group-1', humanIds: ['alice', 'bob'] },
    },
    {
      args: ['channels', 'add-member', 'group-1', 'alice'],
      method: 'channelHumanAdd',
      payload: { channelId: 'group-1', humanId: 'alice' },
    },
    {
      args: ['channels', 'visibility', 'group-1', 'public'],
      method: 'channelVisibilitySet',
      payload: { channelId: 'group-1', visibility: { kind: 'public' } },
    },
    {
      args: ['channels', 'visibility', 'group-1', 'private'],
      method: 'channelVisibilitySet',
      payload: { channelId: 'group-1', visibility: { kind: 'private' } },
    },
    {
      args: ['channels', 'visibility', 'group-1', 'roles:ops,eng'],
      method: 'channelVisibilitySet',
      payload: { channelId: 'group-1', visibility: { kind: 'roles', roleIds: ['ops', 'eng'] } },
    },
    {
      args: ['channels', 'admins', 'group-1', '--set', 'bob-id,alice-id'],
      method: 'channelAdminsSet',
      payload: { channelId: 'group-1', humanIds: ['bob-id', 'alice-id'] },
    },
    {
      args: ['channels', 'add-member', 'group-1', 'bob-id'],
      method: 'channelHumanAdd',
      payload: { channelId: 'group-1', humanId: 'bob-id' },
    },
    {
      args: ['channels', 'description', 'group-1', '--body-stdin'],
      method: 'channelDescriptionSet',
      payload: { channelId: 'group-1', description: 'details' },
    },
    { args: ['dm', 'bob'], method: 'humanDmByUsername', payload: { username: 'bob' } },
    { args: ['dm', '--human-id', 'bob-id'], method: 'humanDm', payload: { humanId: 'bob-id' } },
    { args: ['team-directory'], method: 'teamDirectory', payload: {} },
  ];
  it.each(cases)(
    'maps $method to the Host without model or UI',
    async ({ args, method, payload }) => {
      const f = await host();
      expect((await run(f.url, args, 'details')).status).toBe(0);
      expect(f.calls.at(-1)?.input).toMatchObject({
        method: `botharness/${method}`,
        payload: { args: payload },
      });
    },
  );
  it.each(cases)(
    'keeps --as scoped for $method and propagates refusal',
    async ({ args, method, payload }) => {
      const f = await host();
      expect((await run(f.url, [...args, '--as', 'bob'], 'details')).output).toMatchObject({
        error: { code: 'remote-access/denied' },
      });
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]).toMatchObject({
        path: '/api/botharness/team-as',
        input: { username: 'bob', namespace: 'botharness', method, args: payload },
      });
    },
  );
});

describe('M4 Channel policy CLI', () => {
  it('patches the observed full policy without resetting omitted flags', async () => {
    const f = await host();
    expect(
      (
        await run(f.url, [
          'channels',
          'policy',
          'group-1',
          '--post',
          'admins',
          '--mention-all',
          'admins',
        ])
      ).status,
    ).toBe(0);
    expect(f.calls.at(-1)?.input).toMatchObject({
      method: 'botharness/channelPolicySet',
      payload: {
        args: {
          channelId: 'group-1',
          expectedRevision: 'a'.repeat(64),
          policy: {
            addMembers: 'everyone',
            post: 'admins',
            mentionAll: 'admins',
            addBots: 'admins',
            editDetails: 'admins',
          },
        },
      },
    });
  });
  it('reports a stale policy write without retrying or overwriting newer settings', async () => {
    const f = await host(undefined, {
      code: 'stale-channel-policy',
      message: 'stale-channel-policy',
    });
    const result = await run(f.url, ['channels', 'policy', 'group-1', '--post', 'admins']);
    expect(result.status).toBe(1);
    expect(result.output).toMatchObject({ error: { code: 'stale-channel-policy' } });
    expect(f.calls.map((call) => call.input.method)).toEqual([
      'botharness/channelGet',
      'botharness/channelPolicySet',
    ]);
    expect(f.calls[1]?.input).toMatchObject({
      payload: { args: { expectedRevision: 'a'.repeat(64) } },
    });
  });
  it('keeps both read and mutation on --as and never falls back after denial', async () => {
    const f = await host();
    expect(
      (await run(f.url, ['channels', 'policy', 'group-1', '--post', 'admins', '--as', 'bob']))
        .output,
    ).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      path: '/api/botharness/team-as',
      input: { username: 'bob', method: 'channelGet' },
    });
  });
});

describe('M7 CLI parity', () => {
  it.each(['members:alice:ignored', 'roles:staff:ignored', 'everyone:ignored'])(
    'refuses a malformed audience %s before calling the Host',
    async (audience) => {
      const f = await host();
      const result = await run(f.url, ['bots', 'visibility-set', 'helper', '--public', audience]);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatchObject({ error: { code: 'usage' } });
      expect(f.calls).toEqual([]);
    },
  );
  const cases = [
    {
      args: ['bots', 'visibility-set', 'helper', '--public', 'everyone', '--preview'],
      method: 'botVisibilitySet',
      payload: {
        slug: 'helper',
        visibility: { kind: 'public', audience: { kind: 'everyone' } },
        confirm: false,
      },
    },
    {
      args: ['bots', 'visibility', 'helper'],
      method: 'botVisibility',
      payload: { slug: 'helper' },
    },
    {
      args: ['bots', 'visibility-set', 'helper', '--private', '--confirm'],
      method: 'botVisibilitySet',
      payload: { slug: 'helper', visibility: { kind: 'private' }, confirm: true },
    },
    {
      args: ['bots', 'visibility-set', 'helper', '--public', 'everyone'],
      method: 'botVisibilitySet',
      payload: { slug: 'helper', visibility: { kind: 'public', audience: { kind: 'everyone' } } },
    },
    {
      args: ['bots', 'visibility-set', 'helper', '--public', 'roles:finance,staff'],
      method: 'botVisibilitySet',
      payload: {
        slug: 'helper',
        visibility: { kind: 'public', audience: { kind: 'roles', roleIds: ['finance', 'staff'] } },
      },
    },
    {
      args: ['bots', 'visibility-set', 'helper', '--public', 'members:alice,bob'],
      method: 'botVisibilitySet',
      payload: {
        slug: 'helper',
        visibility: { kind: 'public', audience: { kind: 'members', humanIds: ['alice', 'bob'] } },
      },
    },
    {
      args: [
        'bots',
        'switches',
        'helper',
        '--proactive-dms',
        'on',
        '--join-channels',
        'off',
        '--speaker-context',
        'off',
      ],
      method: 'botSwitches',
      payload: {
        slug: 'helper',
        proactiveDms: true,
        joinPrincipalChannels: false,
        speakerContext: false,
      },
    },
    { args: ['bots', 'switches', 'helper'], method: 'botSwitches', payload: { slug: 'helper' } },
    { args: ['bots', 'reachable'], method: 'reachableBots', payload: {} },
    {
      args: ['bots', 'proactive-opt-out', 'helper', 'on'],
      method: 'botProactiveOptOut',
      payload: { slug: 'helper', optOut: true },
    },
    { args: ['roles', 'conflicts', 'bob'], method: 'roleConflicts', payload: { username: 'bob' } },
    {
      args: ['speaker-policy', '--human-id', 'bob', '--topic', 'finance'],
      method: 'speakerPolicy',
      payload: { humanId: 'bob', topic: 'finance' },
    },
  ];
  it.each(cases)(
    'dispatches $method as the member without Owner fallback',
    async ({ args, method, payload }) => {
      const f = await host(undefined, undefined, undefined, { done: true });
      const result = await run(f.url, ['--as', 'bob', ...args]);
      expect(result.status).toBe(0);
      expect(f.calls).toEqual([
        {
          path: '/api/botharness/team-as',
          input: { username: 'bob', namespace: 'botharness', method, args: payload },
        },
      ]);
    },
  );
});

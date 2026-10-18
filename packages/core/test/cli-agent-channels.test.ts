import { describe, expect, it, vi } from 'vitest';
import { parseAgentManagement, TOB_AGENT_COMMAND_USAGE } from '../src/bots/cli-agent-management.js';

const fingerprint = 'a'.repeat(64);
function parser() {
  const readStdin = vi.fn(async () => 'private-input');
  const io = { env: {}, stdout: vi.fn(), stderr: vi.fn(), readStdin };
  return {
    readStdin,
    parse: (command: string, rest: string[] = [], values: Record<string, unknown> = {}) =>
      parseAgentManagement(command, rest, values, io),
  };
}
describe('scoped Channel CLI dispatch', () => {
  it('normalizes bounded metadata and observed Group detail without reading private input', async () => {
    const p = parser();
    expect(await p.parse('channels', [], { limit: '2', cursor: 'group-1' })).toEqual({
      command: 'channels',
      args: { limit: 2, cursor: 'group-1' },
      write: false,
    });
    expect(await p.parse('channel', ['group-1'])).toEqual({
      command: 'channel',
      args: { channelId: 'group-1' },
      write: false,
    });
    expect(p.readStdin).not.toHaveBeenCalled();
  });
  it('keeps explicit initial membership separate from subsequent invitations', async () => {
    const p = parser();
    expect(
      await p.parse('group-create', ['Project'], {
        'operation-key': 'create-operation-1',
        member: ['one', 'two'],
      }),
    ).toEqual({
      command: 'group-create',
      args: { name: 'Project', members: ['one', 'two'], operationKey: 'create-operation-1' },
      write: true,
    });
    expect(
      await p.parse('group-create', ['Empty'], { 'operation-key': 'create-operation-2' }),
    ).toMatchObject({ args: { members: [] } });
    expect(
      await p.parse('group-invite', ['group-1'], {
        bot: 'three',
        'operation-key': 'invite-operation-1',
        'expected-channel': fingerprint,
      }),
    ).toEqual({
      command: 'group-invite',
      args: {
        channelId: 'group-1',
        botSlug: 'three',
        operationKey: 'invite-operation-1',
        expectedChannel: fingerprint,
      },
      write: true,
    });
    expect(TOB_AGENT_COMMAND_USAGE['group-create']).toContain('join directly');
    expect(TOB_AGENT_COMMAND_USAGE['group-invite']).toContain('acceptance policy');
    expect(p.readStdin).not.toHaveBeenCalled();
  });
  it.each(['host', 'token', 'home', 'owner', 'system-role', 'accept', 'confirm'])(
    'rejects --%s rather than falling through to Human transport',
    async (flag) => {
      const p = parser();
      await expect(
        p.parse('group-invite', ['group-1'], {
          bot: 'three',
          'operation-key': 'invite-operation-1',
          'expected-channel': fingerprint,
          [flag]: 'private-value',
        }),
      ).rejects.toMatchObject({ code: 'agent-scope-denied' });
      expect(p.readStdin).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['group-create', ['Group'], {}],
    ['group-create', ['Group'], { 'operation-key': 'short' }],
    ['group-create', ['Group'], { 'operation-key': 'operation-1', member: ['same', 'same'] }],
    ['group-create', ['Group'], { 'operation-key': 'operation-1', member: 'not-array' }],
    ['group-invite', ['group-1'], { bot: 'one', 'operation-key': 'operation-1' }],
    [
      'group-invite',
      ['group-1'],
      { bot: 'one', 'operation-key': 'operation-1', 'expected-channel': 'not-a-fingerprint' },
    ],
    ['channels', [], { limit: '0' }],
    ['channels', [], { limit: '101' }],
    ['channels', [], { limit: '2.5' }],
    ['channel', [], {}],
    ['channel', ['one', 'two'], {}],
  ] as const)('refuses malformed %s arguments', async (command, rest, values) => {
    await expect(parser().parse(command, [...rest], values)).rejects.toMatchObject({
      code: 'usage',
    });
  });
});

describe('scoped invitation cancellation and join decisions', () => {
  const writes = [
    {
      command: 'group-invite-cancel',
      flags: { invitation: ' invite-1 ' },
      args: { invitationId: 'invite-1' },
    },
    {
      command: 'group-join-decide',
      flags: { request: ' request-1 ', accept: true },
      args: { requestId: 'request-1', accept: true },
    },
    {
      command: 'group-join-decide',
      flags: { request: 'request-2', decline: true },
      args: { requestId: 'request-2', accept: false },
    },
  ];
  it.each(writes)(
    'parses $command with an explicit observed Group fingerprint',
    async ({ command, flags, args }) => {
      const p = parser();
      expect(
        await p.parse(command, ['group-1'], { ...flags, 'expected-channel': fingerprint }),
      ).toEqual({
        command,
        args: { channelId: 'group-1', expectedChannel: fingerprint, ...args },
        write: true,
      });
      expect(p.readStdin).not.toHaveBeenCalled();
      expect(TOB_AGENT_COMMAND_USAGE[command]).toContain('--expected-channel');
    },
  );

  it.each(writes)(
    'rejects missing or malformed fingerprints for $command',
    async ({ command, flags }) => {
      for (const value of [undefined, '', 'old', 'a'.repeat(63), 'A'.repeat(64), 4])
        await expect(
          parser().parse(command, ['group-1'], { ...flags, 'expected-channel': value }),
        ).rejects.toMatchObject({ code: 'usage' });
    },
  );

  it.each(writes)(
    'rejects unrelated flags and wrong positional counts for $command',
    async ({ command, flags }) => {
      for (const flag of ['host', 'token', 'home', 'owner', 'operation-key', 'bot', 'confirm'])
        await expect(
          parser().parse(command, ['group-1'], {
            ...flags,
            'expected-channel': fingerprint,
            [flag]: 'private-value',
          }),
        ).rejects.toMatchObject({ code: 'agent-scope-denied' });
      for (const rest of [[], ['group-1', 'extra'], [''], ['x'.repeat(513)], ['group\n1']])
        await expect(
          parser().parse(command, rest, { ...flags, 'expected-channel': fingerprint }),
        ).rejects.toMatchObject({ code: 'usage' });
    },
  );

  it.each([
    {},
    { accept: true, decline: true },
    { accept: false },
    { decline: false },
    { accept: 'true' },
    { decline: 'true' },
    { accept: true, decline: 'false' },
    { accept: null, decline: true },
  ])('requires exactly one boolean join decision', async (decision) => {
    await expect(
      parser().parse('group-join-decide', ['group-1'], {
        request: 'request-1',
        'expected-channel': fingerprint,
        ...decision,
      }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it.each(['group-invite-cancel', 'group-join-decide'])(
    'rejects missing or malformed target IDs for %s',
    async (command) => {
      const field = command === 'group-invite-cancel' ? 'invitation' : 'request';
      for (const value of [undefined, '', '  ', 'a'.repeat(513), 'id\n1', 42])
        await expect(
          parser().parse(command, ['group-1'], {
            'expected-channel': fingerprint,
            [field]: value,
            ...(command === 'group-join-decide' ? { accept: true } : {}),
          }),
        ).rejects.toMatchObject({ code: 'usage' });
    },
  );
});

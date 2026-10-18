import sharp from 'sharp';
import { realpathSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseAgentManagement } from '../src/bots/cli-agent-management.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';

const orchestrator = { provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' };
const assignmentDefault = { provider: 'deepseek', model: 'chat' };
const assignmentModels = [
  { ...assignmentDefault, allowedEfforts: ['', 'high'], defaultEffort: '', note: 'Quick tasks' },
];
const plan = { orchestrator, assignmentDefault, assignmentModels };
const presetFlags = {
  name: 'Balanced',
  'orchestrator-provider': 'deepseek',
  'orchestrator-model': 'reasoner',
  'orchestrator-effort': 'high',
  'assignment-provider': 'deepseek',
  'assignment-model': 'chat',
};
function parser(stdin = '') {
  const readStdin = vi.fn(async () => stdin);
  const stdout = vi.fn();
  const stderr = vi.fn();
  const parse = (command: string, rest: string[] = [], values: Record<string, unknown> = {}) =>
    parseAgentManagement(command, rest, values, { env: {}, stdout, stderr, readStdin });
  return { parse, readStdin, stdout, stderr };
}

describe('scoped management CLI arguments', () => {
  it('only recognizes the scoped management surface', async () => {
    const { parse } = parser();
    expect(await parse('settings')).toBeUndefined();
    expect(await parse('channel-create')).toBeUndefined();
    expect(await parse('model-preset-delete')).toBeUndefined();
  });

  it.each([
    'list',
    'model-catalog',
    'model-presets',
    'telemetry-status',
    'git-status',
    'release-check',
  ])('classifies %s as a bounded Host read without consuming input', async (command) => {
    const { parse, readStdin, stdout, stderr } = parser('private input');
    expect(await parse(command, [], { compact: true, timeout: '1000' })).toEqual({
      command,
      args: {},
      write: false,
    });
    expect(readStdin).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('normalizes targeted reads and optional release metadata', async () => {
    const { parse } = parser();
    expect(await parse('model-plan', ['research'])).toEqual({
      command: 'model-plan',
      args: { slug: 'research' },
      write: false,
    });
    expect(await parse('release-info', [], { since: '1.2.3' })).toEqual({
      command: 'release-info',
      args: { since: '1.2.3' },
      write: false,
    });
    await expect(parse('model-plan')).rejects.toMatchObject({ code: 'usage' });
    await expect(parse('model-catalog', ['research'])).rejects.toMatchObject({ code: 'usage' });
  });

  it.each(['host', 'token', 'token-file', 'home', 'bot', 'config', 'provider-api-key'])(
    'rejects --%s without reflecting its private value or consuming stdin',
    async (flag) => {
      const { parse, readStdin } = parser('private secret');
      try {
        await parse('model-plan-set', ['research'], {
          [flag]: 'private secret',
          'plan-stdin': true,
          'expected-revision': '4',
        });
        expect.fail('must reject option');
      } catch (error) {
        expect(error).toBeInstanceOf(CliLiveError);
        expect(error).toMatchObject({ code: 'agent-scope-denied' });
        expect(String(error)).not.toContain('private secret');
      }
      expect(readStdin).not.toHaveBeenCalled();
    },
  );

  it('requires the observed revision for default model and preserves reasoning effort', async () => {
    const { parse } = parser();
    const flags = { provider: 'deepseek', model: 'reasoner', 'orchestrator-effort': 'high' };
    await expect(parse('home-model-set', [], flags)).rejects.toMatchObject({ code: 'usage' });
    expect(await parse('home-model-set', [], { ...flags, 'expected-revision': '7' })).toEqual({
      command: 'home-model-set',
      args: { route: orchestrator, expectedRevision: 7 },
      write: true,
    });
  });

  it('keeps customization and inheritance targeted at the reviewed Bot revision', async () => {
    const { parse } = parser();
    expect(
      await parse('model-plan-customize', ['research'], {
        'orchestrator-provider': 'deepseek',
        'orchestrator-model': 'reasoner',
        'orchestrator-effort': 'high',
        'expected-revision': '0',
      }),
    ).toEqual({
      command: 'model-plan-customize',
      args: { slug: 'research', expectedRevision: 0, orchestrator },
      write: true,
    });
    expect(await parse('model-plan-inherit', ['research'], { 'expected-revision': '8' })).toEqual({
      command: 'model-plan-inherit',
      args: { slug: 'research', expectedRevision: 8 },
      write: true,
    });
  });

  it.each([undefined, '-1', '1.5', '1e2', '9007199254740992', 3])(
    'rejects unsafe revision %s before reading the plan',
    async (revision) => {
      const { parse, readStdin } = parser(JSON.stringify(plan));
      await expect(
        parse('model-plan-set', ['research'], {
          'plan-stdin': true,
          'expected-revision': revision,
        }),
      ).rejects.toMatchObject({ code: 'usage' });
      expect(readStdin).not.toHaveBeenCalled();
    },
  );

  it('preserves all full-plan choices and notes from private stdin', async () => {
    const { parse, stdout, stderr } = parser(JSON.stringify(plan));
    expect(
      await parse('model-plan-set', ['research'], { 'plan-stdin': true, 'expected-revision': '9' }),
    ).toEqual({
      command: 'model-plan-set',
      args: { slug: 'research', expectedRevision: 9, ...plan },
      write: true,
    });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('updates only Assignment routes without supplying an Orchestrator', async () => {
    const { parse } = parser(JSON.stringify({ assignmentDefault, assignmentModels }));
    expect(
      await parse('model-plan-assignments-set', ['research'], {
        'plan-stdin': true,
        'expected-revision': '9',
      }),
    ).toEqual({
      command: 'model-plan-assignments-set',
      args: { slug: 'research', expectedRevision: 9, assignmentDefault, assignmentModels },
      write: true,
    });
  });

  it.each([
    '{"private secret":',
    JSON.stringify({ ...plan, apiKey: 'private secret' }),
    JSON.stringify({ ...plan, orchestrator: { ...orchestrator, apiKey: 'private secret' } }),
    JSON.stringify({
      ...plan,
      assignmentModels: [{ ...assignmentModels[0], token: 'private secret' }],
    }),
    JSON.stringify({ ...plan, assignmentModels: [...assignmentModels, ...assignmentModels] }),
    JSON.stringify({ ...plan, assignmentDefault: { ...assignmentDefault, model: 'missing' } }),
    JSON.stringify({
      ...plan,
      assignmentModels: [{ ...assignmentModels[0], defaultEffort: 'high' }],
    }),
    JSON.stringify({ ...plan, assignmentModels: [] }),
    ' '.repeat(16 * 1024 + 1),
  ])('rejects invalid private plan input without echoing it', async (stdin) => {
    const { parse } = parser(stdin);
    try {
      await parse('model-plan-set', ['research'], { 'plan-stdin': true, 'expected-revision': '4' });
      expect.fail('must reject invalid plan');
    } catch (error) {
      expect(error).toMatchObject({ code: 'usage' });
      expect(String(error)).not.toContain('private secret');
    }
  });

  it('creates a preset without fetching a default or requiring an existing revision', async () => {
    const { parse, readStdin } = parser();
    expect(await parse('model-preset-create', [], presetFlags)).toEqual({
      command: 'model-preset-create',
      args: { name: 'Balanced', orchestrator, assignmentDefault },
      write: true,
    });
    expect(readStdin).not.toHaveBeenCalled();
    await expect(
      parse('model-preset-create', [], { ...presetFlags, 'expected-revision': '1' }),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
  });

  it('updates a preset with explicit routes, revision and optional Assignment choices', async () => {
    const { parse } = parser(JSON.stringify({ assignmentModels }));
    expect(
      await parse('model-preset-update', ['preset-1'], {
        ...presetFlags,
        'expected-revision': '2',
        'plan-stdin': true,
      }),
    ).toEqual({
      command: 'model-preset-update',
      args: {
        id: 'preset-1',
        name: 'Balanced',
        expectedRevision: 2,
        orchestrator,
        assignmentDefault,
        assignmentModels,
      },
      write: true,
    });
    await expect(
      parse('model-preset-update', ['preset-1'], { ...presetFlags, 'expected-revision': '0' }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('model-preset-update', ['preset-1'], { name: 'Balanced', 'expected-revision': '2' }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('requires both the reviewed Bot and source preset revisions when applying', async () => {
    const { parse } = parser();
    const flags = { preset: 'preset-1', 'expected-revision': '4', 'preset-revision': '2' };
    expect(await parse('model-preset-apply', ['research'], flags)).toEqual({
      command: 'model-preset-apply',
      args: {
        slug: 'research',
        presetId: 'preset-1',
        expectedRevision: 4,
        expectedPresetRevision: 2,
      },
      write: true,
    });
    await expect(
      parse('model-preset-apply', ['research'], { ...flags, 'preset-revision': undefined }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('accepts exactly one telemetry preference and treats Git installation as a write', async () => {
    const { parse } = parser();
    expect(await parse('telemetry-set', [], { enabled: true })).toEqual({
      command: 'telemetry-set',
      args: { enabled: true },
      write: true,
    });
    expect(await parse('telemetry-set', [], { disabled: true })).toEqual({
      command: 'telemetry-set',
      args: { enabled: false },
      write: true,
    });
    await expect(parse('telemetry-set')).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('telemetry-set', [], { enabled: true, disabled: true }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(await parse('git-install')).toEqual({ command: 'git-install', args: {}, write: true });
  });

  it.each(['release-install', 'release-restart'])(
    'requires explicit confirmation for %s',
    async (command) => {
      const { parse } = parser();
      const rest = command === 'release-install' ? ['1.2.3'] : [];
      await expect(parse(command, rest)).rejects.toMatchObject({ code: 'usage' });
      await expect(parse(command, rest, { confirm: 'true' })).rejects.toMatchObject({
        code: 'usage',
      });
      expect(await parse(command, rest, { confirm: true })).toEqual({
        command,
        args: { ...(rest.length ? { version: '1.2.3' } : {}), confirm: true },
        write: true,
      });
    },
  );
});

describe('scoped Group settings CLI', () => {
  const expectedChannel = 'a'.repeat(64);
  const writes = [
    { command: 'channel-rename', flags: { name: ' Launch team ' }, args: { name: 'Launch team' } },
    { command: 'group-delete', flags: { confirm: true }, args: { confirm: true } },
    { command: 'group-avatar-set', flags: { clear: true }, args: { avatar: null } },
    { command: 'group-member-remove', flags: { bot: 'ada' }, args: { botSlug: 'ada' } },
    {
      command: 'group-wake-set',
      flags: { bot: 'ada', mode: 'mentions' },
      args: { botSlug: 'ada', mode: 'mentions', count: 5, intervalSeconds: 30 },
    },
    {
      command: 'group-wake-set',
      flags: { bot: 'ada', inherit: true },
      args: { botSlug: 'ada', mode: 'digest', count: 5, intervalSeconds: 30, inherit: true },
    },
    {
      command: 'group-wake-set',
      flags: { bot: 'ada', mode: 'all', count: '2', interval: '60' },
      args: { botSlug: 'ada', mode: 'all', count: 2, intervalSeconds: 60 },
    },
  ];

  it('reads wake policies without granting a write', async () => {
    expect(await parser().parse('group-wake-policies', ['team'])).toEqual({
      command: 'group-wake-policies',
      args: { channelId: 'team' },
      write: false,
    });
  });

  it.each(writes)(
    'parses $command with its observed fingerprint and existing defaults',
    async ({ command, flags, args }) => {
      expect(
        await parser().parse(command, ['team'], { ...flags, 'expected-channel': expectedChannel }),
      ).toEqual({
        command,
        args: { channelId: 'team', expectedChannel, ...args },
        write: true,
      });
    },
  );

  it.each(writes)(
    'refuses missing or malformed fingerprints for $command',
    async ({ command, flags }) => {
      for (const fingerprint of [undefined, '', 'old', 'a'.repeat(63), 'A'.repeat(64), 42]) {
        await expect(
          parser().parse(command, ['team'], { ...flags, 'expected-channel': fingerprint }),
        ).rejects.toMatchObject({ code: 'usage' });
      }
    },
  );

  it.each(writes)(
    'refuses unrelated authority and operation flags for $command',
    async ({ command, flags }) => {
      for (const flag of ['host', 'token', 'operation-key', 'confirm', 'unknown'].filter(
        (flag) => flag !== 'confirm' || command !== 'group-delete',
      )) {
        await expect(
          parser().parse(command, ['team'], {
            ...flags,
            'expected-channel': expectedChannel,
            [flag]: 'private-value',
          }),
        ).rejects.toMatchObject({ code: 'agent-scope-denied' });
      }
    },
  );

  it.each([
    { bot: 'ada' },
    { bot: 'ada', mode: 'loud' },
    { bot: 'ada', mode: 'digest', count: '0' },
    { bot: 'ada', mode: 'digest', count: '101' },
    { bot: 'ada', mode: 'digest', interval: '1.5' },
    { bot: 'ada', mode: 'digest', interval: '3601' },
    { mode: 'all' },
  ])('rejects invalid wake settings before dispatch', async (flags) => {
    await expect(
      parser().parse('group-wake-set', ['team'], { ...flags, 'expected-channel': expectedChannel }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('reuses Human avatar image validation and embeds bytes rather than a local path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scoped-group-avatar-'));
    const path = join(dir, 'avatar');
    const parse = (flags: Record<string, unknown>) =>
      parser().parse('group-avatar-set', ['team'], {
        'expected-channel': expectedChannel,
        ...flags,
      });
    try {
      for (const [, bytes] of [
        [
          'png',
          await sharp({ create: { width: 16, height: 8, channels: 3, background: '#3388aa' } })
            .png()
            .toBuffer(),
        ],
        [
          'jpeg',
          await sharp({ create: { width: 16, height: 8, channels: 3, background: '#3388aa' } })
            .jpeg()
            .toBuffer(),
        ],
        [
          'webp',
          await sharp({ create: { width: 16, height: 8, channels: 3, background: '#3388aa' } })
            .webp()
            .toBuffer(),
        ],
      ] as const) {
        writeFileSync(path, bytes);
        expect(await parse({ 'avatar-file': path })).toEqual({
          command: 'group-avatar-set',
          args: {
            channelId: 'team',
            expectedChannel,
            avatar: expect.stringMatching(/^data:image\/webp;base64,/u),
          },
          write: true,
        });
      }
      await expect(parse({ 'avatar-file': path, clear: true })).rejects.toMatchObject({
        code: 'usage',
      });
      await expect(parse({})).rejects.toMatchObject({ code: 'usage' });
      await expect(parse({ 'avatar-file': join(dir, 'missing') })).rejects.toMatchObject({
        code: 'usage',
      });
      for (const bytes of [
        Buffer.from('private non-image input'),
        Buffer.alloc(0),
        Buffer.alloc(98305),
      ]) {
        writeFileSync(path, bytes);
        await expect(parse({ 'avatar-file': path })).rejects.toMatchObject({ code: 'usage' });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scoped attachment transfer arguments', () => {
  it('transports selected bytes without exposing a local Host path and requires stable identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'scoped-attachment-'));
    try {
      const path = join(realpathSync(root), 'qa.txt');
      writeFileSync(path, 'synthetic attachment');
      await expect(parser().parse('attachment-upload', [], { file: path })).rejects.toMatchObject({
        code: 'usage',
      });
      const invocation = await parser().parse('attachment-upload', [], {
        file: path,
        'upload-id': 'ac501275-f752-44d6-8d5f-82e7c8b50ab2',
      });
      expect(invocation).toEqual({
        command: 'attachment-upload',
        write: true,
        args: {
          name: 'qa.txt',
          uploadId: 'ac501275-f752-44d6-8d5f-82e7c8b50ab2',
          data: Buffer.from('synthetic attachment').toString('base64'),
        },
      });
      expect(JSON.stringify(invocation)).not.toContain(root);
      await expect(
        parser().parse('group-delete', ['team'], { 'expected-channel': 'a'.repeat(64) }),
      ).rejects.toMatchObject({ code: 'usage' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

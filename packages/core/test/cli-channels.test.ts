import sharp from 'sharp';
import { realpathSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown,
  media?: { status: number; body: Uint8Array | string },
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const uploads: Array<{
    url: string;
    authorized: boolean;
    contentType: string | undefined;
    bytes: Buffer;
  }> = [];
  const downloads: Array<{ url: string; authorized: boolean }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith('/api/botharness/attachment/upload?')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      uploads.push({
        url: req.url,
        authorized: req.headers.cookie === 'authority=signed',
        contentType: req.headers['content-type'],
        bytes,
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          attachment: { fileId: 'file:ac501275-f752-44d6-8d5f-82e7c8b50ab2', size: bytes.length },
        }),
      );
      return;
    }
    if (media && req.url?.startsWith('/api/botharness/attachment?')) {
      downloads.push({ url: req.url, authorized: req.headers.cookie === 'authority=signed' });
      res
        .writeHead(media.status, {
          'content-type': media.status === 200 ? 'application/octet-stream' : 'application/json',
        })
        .end(media.body);
      return;
    }
    if (req.method === 'GET') {
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const method = body.method.replace('botharness/', '');
    calls.push({ method, args: body.payload.args });
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: handler(method, body.payload.args),
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls, downloads, uploads };
}

async function invoke(argv: string[], url: string, stdin = '') {
  const stdout: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: () => undefined,
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  return { code, json: JSON.parse(stdout.join('')) };
}

const ok = (method: string, args: Record<string, unknown>) => ({
  ok: true,
  value: { method, args },
});

describe('Channel and group CLI commands', () => {
  it('reads group snapshots and forwards stable create and invite identity without changing unkeyed calls', async () => {
    const live = await host(ok);
    expect((await invoke(['channel', 'team'], live.url)).json).toMatchObject({
      method: 'channelGet',
      args: { channelId: 'team' },
    });
    expect((await invoke(['group-create', 'Empty team'], live.url)).code).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelCreate',
      args: { name: 'Empty team', members: [] },
    });
    expect(
      (
        await invoke(
          [
            'group-create',
            'Team',
            '--member',
            'ada',
            '--member',
            'bob',
            '--operation-key',
            'team-create-1',
          ],
          live.url,
        )
      ).code,
    ).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelCreate',
      args: { name: 'Team', members: ['ada', 'bob'], operationKey: 'team-create-1' },
    });
    expect(
      (
        await invoke(
          [
            'group-invite',
            'team',
            '--bot',
            'ada',
            '--operation-key',
            'team-invite-1',
            '--expected-channel',
            'fingerprint',
          ],
          live.url,
        )
      ).code,
    ).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelGroupInvite',
      args: {
        channelId: 'team',
        botSlug: 'ada',
        operationKey: 'team-invite-1',
        expectedChannel: 'fingerprint',
      },
    });
    expect((await invoke(['group-invite', 'team', '--bot', 'ada'], live.url)).code).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelGroupInvite',
      args: { channelId: 'team', botSlug: 'ada' },
    });
  });

  it('rejects invalid operation identity before connecting and preserves owner refusal codes', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'stale-channel', message: 'Channel changed' },
    }));
    for (const argv of [
      ['group-create', 'Team', '--operation-key', 'short'],
      ['group-invite', 'team', '--bot', 'ada', '--operation-key', 'bad key value'],
      ['group-invite', 'team', '--bot', 'ada', '--expected-channel', ''],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
    const refused = await invoke(
      ['group-invite', 'team', '--bot', 'ada', '--expected-channel', 'old'],
      live.url,
    );
    expect(refused.code).not.toBe(0);
    expect(refused.json.error.code).toBe('stale-channel');
  });

  it('forwards optional observed fingerprints on Human Group changes and preserves unguarded compatibility', async () => {
    const live = await host(ok);
    const expectedChannel = 'b'.repeat(64);
    const commands = [
      ['channel-rename', 'team', '--name', 'New name'],
      ['group-avatar-set', 'team', '--clear'],
      ['group-wake-set', 'team', '--bot', 'ada', '--mode', 'mentions'],
      ['group-wake-set', 'team', '--bot', 'ada', '--inherit'],
      ['group-member-remove', 'team', '--bot', 'ada'],
      ['group-invite-cancel', 'team', '--invitation', 'invite-1'],
      ['group-join-decide', 'team', '--request', 'request-1', '--accept'],
      ['group-join-decide', 'team', '--request', 'request-2', '--decline'],
    ];
    for (const argv of commands) {
      expect((await invoke(argv, live.url)).code).toBe(0);
      const original = live.calls.at(-1)!;
      expect((await invoke([...argv, '--expected-channel', expectedChannel], live.url)).code).toBe(
        0,
      );
      expect(live.calls.at(-1)).toEqual({
        ...original,
        args: { ...original.args, expectedChannel },
      });
    }
    const count = live.calls.length;
    for (const argv of commands) {
      for (const invalid of ['', 'old', 'A'.repeat(64)])
        expect(
          (await invoke([...argv, '--expected-channel', invalid], live.url)).json.error.code,
        ).toBe('usage');
    }
    for (const command of ['group-wake-policies', 'channel', 'group-delete'])
      expect(
        (await invoke([command, 'team', '--expected-channel', expectedChannel], live.url)).json
          .error.code,
      ).toBe('usage');
    expect(live.calls).toHaveLength(count);
  });

  it('reads and updates one personal Channel preference without replacing the roster', async () => {
    const live = await host(ok);
    const expectedState = 'c'.repeat(64);
    expect((await invoke(['channel-preferences', 'dm-ada'], live.url)).code).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelPreferences',
      args: { channelId: 'dm-ada' },
    });
    for (const [command, method, field] of [
      ['channel-pin', 'channelPinSet', 'pinned'],
      ['channel-hide', 'channelHiddenSet', 'hidden'],
      ['channel-mute', 'channelMuteSet', 'muted'],
    ]) {
      for (const off of [false, true]) {
        const argv = [command!, 'dm-ada', ...(off ? ['--off'] : [])];
        expect((await invoke(argv, live.url)).code).toBe(0);
        expect(live.calls.at(-1)).toEqual({
          method,
          args: { channelId: 'dm-ada', [field!]: !off },
        });
        expect((await invoke([...argv, '--expected-state', expectedState], live.url)).code).toBe(0);
        expect(live.calls.at(-1)).toEqual({
          method,
          args: { channelId: 'dm-ada', [field!]: !off, expectedState },
        });
      }
      const count = live.calls.length;
      for (const value of ['', 'old', 'A'.repeat(64), ' ' + expectedState])
        expect(
          (await invoke([command!, 'dm-ada', '--expected-state', value], live.url)).json.error.code,
        ).toBe('usage');
      expect(live.calls).toHaveLength(count);
    }
    const count = live.calls.length;
    for (const argv of [
      ['channel-preferences', 'dm-ada'],
      ['roster-pins-set', 'dm-ada'],
      ['roster-hidden-set', 'dm-ada'],
    ])
      expect(
        (await invoke([...argv, '--expected-state', expectedState], live.url)).json.error.code,
      ).toBe('usage');
    expect(live.calls).toHaveLength(count);
  });

  it('downloads exact original bytes with owner authorization without overwriting an existing file', async () => {
    const bytes = Buffer.from('name,quantity\nalpha,17\n');
    const live = await host(ok, { status: 200, body: bytes });
    const path = join(mkdtempSync(join(tmpdir(), 'cli-source-media-')), 'original.csv');
    const args = [
      'channel-media-download',
      'group',
      '--source-event',
      'source',
      '--attachment',
      'file',
      '--out',
      path,
    ];
    const result = await invoke(args, live.url);
    expect(result.code).toBe(0);
    expect(readFileSync(path)).toEqual(bytes);
    expect(result.json.download).toMatchObject({
      path,
      bytes: bytes.byteLength,
      mime: 'application/octet-stream',
    });
    expect(live.downloads).toEqual([
      {
        url: '/api/botharness/attachment?channelId=group&sourceEventId=source&attachmentId=file',
        authorized: true,
      },
    ]);
    writeFileSync(path, 'local edits');
    expect((await invoke(args, live.url)).json.error.code).toBe('output-exists');
    expect(readFileSync(path, 'utf8')).toBe('local edits');
    const refused = await host(ok, {
      status: 403,
      body: JSON.stringify({
        error: { code: 'source-unavailable', message: 'Attachment source is unavailable' },
      }),
    });
    const denied = await invoke(args, refused.url);
    expect(denied.code).not.toBe(0);
    expect(denied.json.error.code).toBe('source-unavailable');
    expect((await invoke(args.slice(0, -2), live.url)).json.error.code).toBe('usage');
  });
  it('resolves source media with Channel authority and preserves coded refusals', async () => {
    const live = await host(ok);
    const args = [
      'channel-media-target',
      'group',
      '--source-event',
      'source',
      '--attachment',
      'media',
    ];
    const resolved = await invoke(args, live.url);
    expect(resolved.code, JSON.stringify(resolved.json)).toBe(0);
    expect(live.calls).toEqual([
      {
        method: 'channelMediaTarget',
        args: { channelId: 'group', sourceEventId: 'source', attachmentId: 'media' },
      },
    ]);
    const refused = await host(() => ({
      ok: false,
      error: { code: 'source-unavailable', message: 'source-unavailable' },
    }));
    const result = await invoke(args, refused.url);
    expect(result.code).not.toBe(0);
    expect(result.json.error.code).toBe('source-unavailable');
    for (const invalid of [args.slice(0, 2), [...args, '--source-event', 'other']])
      expect((await invoke(invalid, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(1);
  });
  it('maps each command to the bridge method and arguments the Web UI uses', async () => {
    const live = await host(ok);
    const png = join(mkdtempSync(join(tmpdir(), 'cli-channels-')), 'avatar.png');
    writeFileSync(
      png,
      await sharp({ create: { width: 16, height: 8, channels: 3, background: '#3388aa' } })
        .png()
        .toBuffer(),
    );
    const runs: Array<[string[], string?]> = [
      [['channel-rename', 'grp-1', '--name', ' Skill Lab ']],
      [['group-avatar-set', 'grp-1', '--avatar-file', png]],
      [['group-avatar-set', 'grp-1', '--clear']],
      [['group-invite', 'grp-1', '--bot', 'ada']],
      [['group-invite-cancel', 'grp-1', '--invitation', 'inv-1']],
      [['group-join-decide', 'grp-1', '--request', 'req-1', '--accept']],
      [['group-join-decide', 'grp-1', '--request', 'req-2', '--decline']],
      [['group-member-remove', 'grp-1', '--bot', 'ada']],
      [['group-wake-policies', 'grp-1']],
      [['group-wake-set', 'grp-1', '--bot', 'ada', '--mode', 'mentions']],
      [
        [
          'group-wake-set',
          'grp-1',
          '--bot',
          'ada',
          '--mode',
          'all',
          '--count',
          '2',
          '--interval',
          '60',
        ],
      ],
      [['group-wake-set', 'grp-1', '--bot', 'ada', '--inherit']],
      [['group-delete', 'grp-1', '--confirm']],
      [['channel-history']],
      [['channel-history-sources', 'grp-1', '--before', '42']],
      [['channel-journal', 'grp-1', '--through', '9', '--before', '5', '--limit', '3']],
      [
        [
          'channel-timeline',
          'grp-1',
          '--direction',
          'around',
          '--around',
          'm-1',
          '--older-limit',
          '0',
        ],
      ],
      [['channel-timeline', 'grp-1', '--cursor', 'c-1', '--limit', '20']],
      [['channel-mark-read', 'grp-1', '--message-id', 'm-1']],
      [['channel-mark-all-read']],
      [['channel-react', 'grp-1', '--message-id', 'm-1', '--emoji', '👍']],
      [['channel-react', 'grp-1', '--message-id', 'm-1', '--emoji', '👍', '--remove']],
      [['channel-search', 'grp-1', '--query', 'launch', '--cursor', 'c-2', '--limit', '5']],
      [['channel-unread']],
      [['channel-mute', 'grp-1']],
      [['channel-mute', 'grp-1', '--off']],
      [['channel-retry', 'dm-ada', '--message-id', 'm-2']],
      [['channel-bot-stop', 'dm-ada', '--bot', 'ada']],
      [['channel-purge-preview', 'grp-1', '--source-event', 's-1', '--source-event', 's-1']],
      [
        [
          'channel-purge-confirm',
          'grp-1',
          '--source-event',
          's-1',
          '--confirm',
          '--confirmation-stdin',
        ],
        '{"token":"preview-token"}',
      ],
    ];
    for (const [argv, stdin] of runs) expect((await invoke(argv, live.url, stdin)).code).toBe(0);
    expect(live.calls).toEqual([
      { method: 'channelRename', args: { channelId: 'grp-1', name: 'Skill Lab' } },
      {
        method: 'channelGroupAvatarSet',
        args: { channelId: 'grp-1', avatar: expect.stringMatching(/^data:image\/webp;base64,/u) },
      },
      { method: 'channelGroupAvatarSet', args: { channelId: 'grp-1', avatar: null } },
      { method: 'channelGroupInvite', args: { channelId: 'grp-1', botSlug: 'ada' } },
      { method: 'channelGroupInviteCancel', args: { channelId: 'grp-1', invitationId: 'inv-1' } },
      {
        method: 'channelGroupJoinDecide',
        args: { channelId: 'grp-1', requestId: 'req-1', accept: true },
      },
      {
        method: 'channelGroupJoinDecide',
        args: { channelId: 'grp-1', requestId: 'req-2', accept: false },
      },
      { method: 'channelGroupMemberRemove', args: { channelId: 'grp-1', botSlug: 'ada' } },
      { method: 'channelGroupWakePolicies', args: { channelId: 'grp-1' } },
      {
        method: 'channelGroupWakeSet',
        args: {
          channelId: 'grp-1',
          botSlug: 'ada',
          mode: 'mentions',
          count: 5,
          intervalSeconds: 30,
        },
      },
      {
        method: 'channelGroupWakeSet',
        args: { channelId: 'grp-1', botSlug: 'ada', mode: 'all', count: 2, intervalSeconds: 60 },
      },
      {
        method: 'channelGroupWakeSet',
        args: {
          channelId: 'grp-1',
          botSlug: 'ada',
          mode: 'digest',
          count: 5,
          intervalSeconds: 30,
          inherit: true,
        },
      },
      { method: 'channelGroupDelete', args: { channelId: 'grp-1' } },
      { method: 'channelHistory', args: {} },
      { method: 'channelHistorySources', args: { channelId: 'grp-1', before: '42' } },
      {
        method: 'channelJournalPage',
        args: { channelId: 'grp-1', through: 9, before: 5, limit: 3 },
      },
      {
        method: 'channelTimeline',
        args: { channelId: 'grp-1', direction: 'around', around: 'm-1', olderLimit: 0 },
      },
      { method: 'channelTimeline', args: { channelId: 'grp-1', cursor: 'c-1', limit: 20 } },
      { method: 'channelMarkRead', args: { channelId: 'grp-1', messageId: 'm-1' } },
      { method: 'channelMarkAllRead', args: {} },
      {
        method: 'channelReact',
        args: { channelId: 'grp-1', messageId: 'm-1', emoji: '👍', active: true },
      },
      {
        method: 'channelReact',
        args: { channelId: 'grp-1', messageId: 'm-1', emoji: '👍', active: false },
      },
      {
        method: 'channelSearch',
        args: { channelId: 'grp-1', text: 'launch', cursor: 'c-2', limit: 5 },
      },
      { method: 'channelUnreadCounts', args: {} },
      { method: 'channelMuteSet', args: { channelId: 'grp-1', muted: true } },
      { method: 'channelMuteSet', args: { channelId: 'grp-1', muted: false } },
      { method: 'channelRetry', args: { channelId: 'dm-ada', messageId: 'm-2' } },
      { method: 'channelBotStop', args: { channelId: 'dm-ada', botSlug: 'ada' } },
      { method: 'channelPurgePreview', args: { channelId: 'grp-1', sourceEventIds: ['s-1'] } },
      {
        method: 'channelPurgeConfirm',
        args: { channelId: 'grp-1', sourceEventIds: ['s-1'], token: 'preview-token' },
      },
    ]);
  });

  it('refuses destructive and malformed commands before contacting the Host', async () => {
    const live = await host(ok);
    const dir = mkdtempSync(join(tmpdir(), 'cli-channels-'));
    const text = join(dir, 'avatar.txt');
    writeFileSync(text, 'not an image');
    const refused: Array<[string[], string?]> = [
      [['group-delete', 'grp-1']],
      [
        ['channel-purge-confirm', 'grp-1', '--source-event', 's-1', '--confirmation-stdin'],
        '{"token":"t"}',
      ],
      [['channel-purge-confirm', 'grp-1', '--source-event', 's-1', '--confirm']],
      [
        [
          'channel-purge-confirm',
          'grp-1',
          '--source-event',
          's-1',
          '--confirm',
          '--confirmation-stdin',
        ],
        '{}',
      ],
      [['channel-purge-preview', 'grp-1']],
      [['channel-rename', 'grp-1']],
      [['channel-rename']],
      [['channel-mark-all-read', 'grp-1']],
      [['channel-unread', 'grp-1']],
      [['channel-mute']],
      [['group-avatar-set', 'grp-1']],
      [['group-avatar-set', 'grp-1', '--clear', '--avatar-file', text]],
      [['group-avatar-set', 'grp-1', '--avatar-file', text]],
      [['group-avatar-set', 'grp-1', '--avatar-file', join(dir, 'missing.png')]],
      [['group-join-decide', 'grp-1', '--request', 'r', '--accept', '--decline']],
      [['group-join-decide', 'grp-1', '--accept']],
      [['group-wake-set', 'grp-1', '--bot', 'ada']],
      [['group-wake-set', 'grp-1', '--bot', 'ada', '--mode', 'loud']],
      [['group-wake-set', 'grp-1', '--bot', 'ada', '--mode', 'all', '--count', '0']],
      [['group-wake-set', 'grp-1', '--bot', 'ada', '--mode', 'all', '--interval', '1.5']],
      [['channel-journal', 'grp-1']],
      [['channel-timeline', 'grp-1', '--direction', 'sideways']],
      [['channel-timeline', 'grp-1', '--direction', 'around']],
      [['channel-history-sources', 'grp-1', '--before', 'abc']],
      [['channel-retry', 'dm-ada']],
      [['channel-react', 'grp-1', '--emoji', '👍']],
      [['channel-react', 'grp-1', '--message-id', 'm-1']],
      [['channel-search', 'grp-1']],
      [['channel-search', 'grp-1', '--query', 'x', '--limit', '51']],
      [['channel-bot-stop', 'dm-ada']],
    ];
    for (const [argv, stdin] of refused) {
      const result = await invoke(argv, live.url, stdin);
      expect(result.code, argv.join(' ')).not.toBe(0);
      expect(result.json.error.code, argv.join(' ')).toBe('usage');
    }
    expect(live.calls).toEqual([]);
  });

  it('exits non-zero with the Host refusal code', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'invalid-input', message: 'Group join request is no longer pending' },
    }));
    const result = await invoke(
      ['group-join-decide', 'grp-1', '--request', 'req-1', '--accept'],
      live.url,
    );
    expect(result.code).not.toBe(0);
    expect(result.json.error).toEqual({
      code: 'invalid-input',
      message: 'Group join request is no longer pending',
    });
  });

  it('reports a Bot that is not working as a coded refusal', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'not-working', message: 'Ada is not working right now' },
    }));
    const result = await invoke(['channel-bot-stop', 'dm-ada', '--bot', 'ada'], live.url);
    expect(result.code).not.toBe(0);
    expect(result.json.error).toEqual({
      code: 'not-working',
      message: 'Ada is not working right now',
    });
  });
});

it('reads and explicitly toggles Group send review through the live CLI', async () => {
  const live = await host(ok);
  for (const args of [[], ['--accept'], ['--off']]) {
    expect((await invoke(['group-send-review', 'group', ...args], live.url)).code).toBe(0);
  }
  expect(live.calls.map((call) => call.args)).toEqual([
    { channelId: 'group' },
    { channelId: 'group', enabled: true },
    { channelId: 'group', enabled: false },
  ]);
  expect(
    (await invoke(['group-send-review', 'group', '--accept', '--off'], live.url)).code,
  ).not.toBe(0);
});

describe('direct Human attachment transfer', () => {
  it('uploads raw bytes with authentication, stable UUID and one metadata JSON response', async () => {
    const live = await host(ok);
    const root = mkdtempSync(join(tmpdir(), 'cli-upload-'));
    const file = join(realpathSync(root), 'qa.txt');
    writeFileSync(file, 'synthetic transfer');
    const result = await invoke(
      ['attachment-upload', '--file', file, '--upload-id', 'ac501275-f752-44d6-8d5f-82e7c8b50ab2'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      attachment: { size: 18 },
      uploadId: 'ac501275-f752-44d6-8d5f-82e7c8b50ab2',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(live.uploads).toEqual([
      {
        url: '/api/botharness/attachment/upload?name=qa.txt&uploadId=ac501275-f752-44d6-8d5f-82e7c8b50ab2',
        authorized: true,
        contentType: 'application/octet-stream',
        bytes: Buffer.from('synthetic transfer'),
      },
    ]);
    expect(
      (
        await invoke(
          ['group-delete', 'qa', '--confirm', '--expected-channel', 'a'.repeat(64)],
          live.url,
        )
      ).code,
    ).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelGroupDelete',
      args: { channelId: 'qa', expectedChannel: 'a'.repeat(64) },
    });
  });
});

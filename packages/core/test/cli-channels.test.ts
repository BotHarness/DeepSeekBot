import { mkdtempSync, writeFileSync } from 'node:fs';
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

async function host(handler: (method: string, args: Record<string, unknown>) => unknown) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
  return { url: `http://127.0.0.1:${address.port}`, calls };
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
  it('maps each command to the bridge method and arguments the Web UI uses', async () => {
    const live = await host(ok);
    const png = join(mkdtempSync(join(tmpdir(), 'cli-channels-')), 'avatar.png');
    writeFileSync(png, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]));
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
        args: { channelId: 'grp-1', avatar: 'data:image/png;base64,iVBORw0KGgoBAgM=' },
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
});

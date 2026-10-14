import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    expect(req.headers.cookie).toBe('authority=signed');
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
    stderr: () => {},
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  return { code, json: JSON.parse(stdout.join('')) };
}

const ok = () => ({ ok: true, value: { done: true } });
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);

function file(name: string, bytes: Buffer): string {
  const path = join(mkdtempSync(join(tmpdir(), 'cli-profile-')), name);
  writeFileSync(path, bytes);
  return path;
}

describe('Bot profile and appearance commands', () => {
  it('sets avatar, banner, appearance and primary color on the Bot DM', async () => {
    const live = await host(ok);
    const image = file('avatar.png', PNG);
    await invoke(['bot-avatar-set', 'ada', '--file', image], live.url);
    await invoke(['bot-avatar-set', 'ada', '--clear'], live.url);
    await invoke(['bot-banner-set', 'ada', '--file', image], live.url);
    await invoke(
      ['bot-banner-set', 'ada', '--recipe-stdin'],
      live.url,
      '{"scene":"meadow","seed":7}',
    );
    await invoke(['bot-banner-set', 'ada', '--clear'], live.url);
    await invoke(['bot-appearance-set', 'ada', '--recipe-stdin'], live.url, '{"hair":"bob"}');
    await invoke(['bot-primary-color-set', 'ada', '--color', '#AABBCC'], live.url);
    await invoke(['bot-primary-color-set', 'ada', '--automatic'], live.url);
    const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`;
    expect(live.calls).toEqual([
      { method: 'botAvatarSet', args: { channelId: 'dm-ada', avatar: dataUrl } },
      { method: 'botAvatarSet', args: { channelId: 'dm-ada', avatar: null } },
      { method: 'botBannerSet', args: { channelId: 'dm-ada', banner: { image: dataUrl } } },
      {
        method: 'botBannerSet',
        args: { channelId: 'dm-ada', banner: { recipe: { scene: 'meadow', seed: 7 } } },
      },
      { method: 'botBannerSet', args: { channelId: 'dm-ada', banner: null } },
      { method: 'botAppearanceSet', args: { channelId: 'dm-ada', recipe: { hair: 'bob' } } },
      {
        method: 'botPrimaryColorSet',
        args: { channelId: 'dm-ada', primaryColor: { mode: 'custom', color: '#aabbcc' } },
      },
      {
        method: 'botPrimaryColorSet',
        args: { channelId: 'dm-ada', primaryColor: { mode: 'automatic' } },
      },
    ]);
  });

  it('refuses ambiguous or unreadable inputs before contacting the Host', async () => {
    const live = await host(ok);
    const text = file('note.txt', Buffer.from('not an image'));
    for (const [argv, code] of [
      [['bot-avatar-set', 'ada'], 'usage'],
      [['bot-avatar-set', 'ada', '--file', text], 'usage'],
      [['bot-avatar-set', 'ada', '--file', '/nonexistent/avatar.png'], 'file-unreadable'],
      [['bot-banner-set', 'ada', '--clear', '--recipe-stdin'], 'usage'],
      [['bot-appearance-set', 'ada'], 'usage'],
      [['bot-primary-color-set', 'ada', '--color', 'red'], 'usage'],
      [['bot-primary-color-set', 'ada', '--color', '#112233', '--automatic'], 'usage'],
    ] as const) {
      const result = await invoke([...argv], live.url);
      expect(result.code).not.toBe(0);
      expect(result.json.error.code).toBe(code);
    }
    expect(live.calls).toHaveLength(0);
  });

  it('passes the Host refusal code through', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid Avatar Appearance' },
    }));
    const result = await invoke(['bot-appearance-set', 'ada', '--recipe-stdin'], live.url, '{}');
    expect(result.code).not.toBe(0);
    expect(result.json.error).toMatchObject({
      code: 'invalid-input',
      message: 'invalid Avatar Appearance',
    });
  });
});

describe('Source policies, standing limits and developer mode', () => {
  it('reads, sets and resets each source class with the fields the Host expects', async () => {
    const live = await host(ok);
    await invoke(['bot-source-policies', 'ada'], live.url);
    await invoke(
      [
        'bot-source-policy-set',
        'ada',
        '--source-class',
        'assignment-report',
        '--wake',
        'immediate',
      ],
      live.url,
    );
    await invoke(
      [
        'bot-source-policy-set',
        'ada',
        '--source-class',
        'group-ordinary',
        '--wake',
        'digest',
        '--digest-count',
        '5',
        '--digest-interval',
        '600',
      ],
      live.url,
    );
    await invoke(
      ['bot-source-policy-set', 'ada', '--source-class', 'human-dm', '--delivery', 'turn'],
      live.url,
    );
    await invoke(['bot-source-policy-reset', 'ada', '--source-class', 'bot-dm'], live.url);
    await invoke(
      ['bot-standing-limits-set', 'ada', '--soul', '4000', '--core-memory', '8000'],
      live.url,
    );
    await invoke(['developer-mode-set', '--enabled'], live.url);
    expect(live.calls).toEqual([
      { method: 'botSourcePolicies', args: { slug: 'ada' } },
      {
        method: 'botSourcePolicySet',
        args: { slug: 'ada', sourceClass: 'assignment-report', wake: 'immediate' },
      },
      {
        method: 'botSourcePolicySet',
        args: {
          slug: 'ada',
          sourceClass: 'group-ordinary',
          wake: 'digest',
          digestCount: 5,
          digestIntervalSeconds: 600,
        },
      },
      {
        method: 'botSourcePolicySet',
        args: { slug: 'ada', sourceClass: 'human-dm', wake: 'immediate', delivery: 'turn' },
      },
      { method: 'botSourcePolicyReset', args: { slug: 'ada', sourceClass: 'bot-dm' } },
      { method: 'standingLimitsSet', args: { slug: 'ada', soul: 4000, coreMemory: 8000 } },
      { method: 'developerModeSet', args: { enabled: true } },
    ]);
    for (const argv of [
      ['bot-source-policy-set', 'ada', '--source-class', 'everything'],
      ['bot-source-policy-set', 'ada', '--source-class', 'human-dm'],
      ['bot-source-policy-set', 'ada', '--source-class', 'group-ordinary', '--wake', 'digest'],
      ['bot-source-policy-set', 'ada', '--source-class', 'assignment-report', '--wake', 'silent'],
      ['bot-standing-limits-set', 'ada', '--soul', '1.5', '--core-memory', '10'],
      ['developer-mode-set'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(7);
  });
});

describe('Roster and Human naming', () => {
  it('reads and changes the roster with the same calls as the sidebar', async () => {
    const live = await host(ok);
    await invoke(['roster'], live.url);
    await invoke(['roster-batch', 'pin', 'dm-ada', 'group-1'], live.url);
    await invoke(['roster-batch', 'move', 'dm-ada', '--section', 'sec-1'], live.url);
    await invoke(['roster-batch', 'move', 'dm-ada'], live.url);
    await invoke(['roster-pins-set', 'dm-ada'], live.url);
    await invoke(['roster-pins-set'], live.url);
    await invoke(['roster-hidden-set', 'group-1'], live.url);
    await invoke(['roster-section-create', 'Work bots'], live.url);
    await invoke(['roster-section-rename', 'sec-1', '--name', 'Play'], live.url);
    await invoke(['roster-section-remove', 'sec-1', '--confirm'], live.url);
    await invoke(['roster-section-reorder', 'sec-2', 'sec-1'], live.url);
    await invoke(['roster-top-reorder', 'section:sec-1', 'channel:dm-ada'], live.url);
    expect(live.calls).toEqual([
      { method: 'rosterGet', args: {} },
      { method: 'rosterBatch', args: { action: 'pin', channelIds: ['dm-ada', 'group-1'] } },
      {
        method: 'rosterBatch',
        args: { action: 'move', channelIds: ['dm-ada'], sectionId: 'sec-1' },
      },
      { method: 'rosterBatch', args: { action: 'move', channelIds: ['dm-ada'], sectionId: null } },
      { method: 'pinsSet', args: { pins: ['dm-ada'] } },
      { method: 'pinsSet', args: { pins: [] } },
      { method: 'hiddenSet', args: { hidden: ['group-1'] } },
      { method: 'sectionCreate', args: { name: 'Work bots' } },
      { method: 'sectionRename', args: { sectionId: 'sec-1', name: 'Play' } },
      { method: 'sectionRemove', args: { sectionId: 'sec-1' } },
      { method: 'sectionReorder', args: { order: ['sec-2', 'sec-1'] } },
      {
        method: 'topReorder',
        args: {
          order: [
            { kind: 'section', id: 'sec-1' },
            { kind: 'channel', id: 'dm-ada' },
          ],
        },
      },
    ]);
    for (const argv of [
      ['roster-batch', 'archive', 'dm-ada'],
      ['roster-batch', 'pin'],
      ['roster-batch', 'hide', 'dm-ada', '--section', 'sec-1'],
      ['roster-section-remove', 'sec-1'],
      ['roster-section-rename', 'sec-1'],
      ['roster-top-reorder', 'dm-ada'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(12);
  });

  it('reads the Human identity and sets names through the Host when one is selected', async () => {
    const live = await host(ok);
    await invoke(['human-identity'], live.url);
    await invoke(['human-name-set', '--name', 'Vain'], live.url);
    await invoke(['human-name-set', '--clear'], live.url);
    await invoke(['channel-human-name-set', 'group-1', '--nickname', 'Boss'], live.url);
    await invoke(['channel-human-name-set', 'group-1', '--clear'], live.url);
    expect(live.calls).toEqual([
      { method: 'humanIdentity', args: {} },
      { method: 'humanNameSet', args: { displayName: 'Vain' } },
      { method: 'humanNameSet', args: { displayName: null } },
      { method: 'channelHumanNameSet', args: { channelId: 'group-1', nickname: 'Boss' } },
      { method: 'channelHumanNameSet', args: { channelId: 'group-1', nickname: null } },
    ]);
    expect((await invoke(['human-name-set'], live.url)).json.error.code).toBe('usage');
  });
});

describe('Part Library', () => {
  it('lists, adds, imports and exports parts', async () => {
    const live = await host((method) =>
      method === 'partLibraryExport'
        ? {
            ok: true,
            value: { fileName: 'part-library.zip', data: Buffer.from('zip').toString('base64') },
          }
        : ok(),
    );
    const png = file('part.png', PNG);
    const out = join(mkdtempSync(join(tmpdir(), 'cli-profile-out-')), 'library.zip');
    await invoke(['part-library'], live.url);
    await invoke(
      ['part-library-add', '--part-stdin', '--name', 'Bob', '--parent', 'a'.repeat(64)],
      live.url,
      '{"slot":"hair"}',
    );
    await invoke(['part-library-import', '--file', png], live.url);
    await invoke(
      ['part-library-import-image', '--file', png, '--slot', 'hair', '--colors', '4'],
      live.url,
    );
    const exported = await invoke(['part-library-export', '--out', out], live.url);
    await invoke(['part-library-export', '--out', out, '--part-id', 'b'.repeat(64)], live.url);
    await invoke(['part-library-export', '--out', out, '--part-stdin'], live.url, '{"slot":"hat"}');
    expect(exported.json).toEqual({ fileName: 'part-library.zip', path: out, bytes: 3 });
    expect(readFileSync(out, 'utf8')).toBe('zip');
    expect(live.calls).toEqual([
      { method: 'partLibraryList', args: {} },
      {
        method: 'partLibraryAdd',
        args: { part: { slot: 'hair' }, name: 'Bob', parent: 'a'.repeat(64) },
      },
      { method: 'partLibraryImport', args: { data: PNG.toString('base64') } },
      {
        method: 'partLibraryImportImage',
        args: { data: PNG.toString('base64'), slot: 'hair', colors: 4, name: '' },
      },
      { method: 'partLibraryExport', args: {} },
      { method: 'partLibraryExport', args: { id: 'b'.repeat(64) } },
      { method: 'partLibraryExport', args: { part: { slot: 'hat' } } },
    ]);
    for (const argv of [
      ['part-library-add'],
      ['part-library-import'],
      ['part-library-import-image', '--file', png, '--colors', '4'],
      ['part-library-import-image', '--file', png, '--slot', 'hair', '--colors', '0'],
      ['part-library-export', '--out', 'relative.zip'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(7);
  });
});

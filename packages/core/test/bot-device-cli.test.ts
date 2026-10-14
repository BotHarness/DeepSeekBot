import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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

type Call = { method: string; path: string; body: unknown };

async function host(
  route: (call: Call) => {
    status?: number;
    json?: unknown;
    bytes?: Buffer;
    headers?: Record<string, string>;
  },
) {
  const calls: Call[] = [];
  let logins = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    if (req.method === 'GET' && url.searchParams.has('token')) {
      logins += 1;
      if (url.searchParams.get('token') !== 'private-test-token') {
        res.writeHead(403).end();
        return;
      }
      if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const parsed = text === '' ? undefined : JSON.parse(text);
    const rpc = parsed?.type === 'client-request';
    const call: Call = {
      method: req.method!,
      path: rpc ? parsed.method.replace('botharness/', '') : url.pathname + url.search,
      body: rpc ? parsed.payload.args : parsed,
    };
    calls.push(call);
    const answer = route(call);
    if (rpc) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ type: 'server-response', rpcId: parsed.rpcId, result: answer.json }),
      );
      return;
    }
    if (answer.bytes !== undefined) {
      res.writeHead(answer.status ?? 200, answer.headers ?? {});
      res.end(answer.bytes);
      return;
    }
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.json ?? {}));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invokeWithStdin(argv: string[], url: string, stdin: string) {
  const stdout: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: () => undefined,
    readStdin: async () => stdin,
  });
  return { code, json: JSON.parse(stdout.join('')) };
}

async function invoke(argv: string[], url: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => '',
  });
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(out) };
}

describe('Agent Browser and Computer commands', () => {
  it('opens a Bot browser, saves one frame, and takes over and releases it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-frame-'));
    dirs.push(dir);
    const live = await host((call) =>
      call.path.startsWith('/api/browser/frame')
        ? {
            json: {
              ok: true,
              seq: 3,
              mode: 'stream',
              mimeType: 'image/jpeg',
              data: Buffer.from('jpeg-bytes').toString('base64'),
              viewport: { width: 1440, height: 900 },
            },
          }
        : { json: { ok: true, tabId: 'tab-1', viewerUrl: '/viewer' } },
    );
    expect((await invoke(['browser-open', 'ada'], live.url)).json).toEqual({
      ok: true,
      tabId: 'tab-1',
      viewerUrl: '/viewer',
    });
    const file = join(dir, 'frame.jpg');
    expect((await invoke(['browser-frame', 'ada', '--out', file], live.url)).json).toEqual({
      path: file,
      bytes: 10,
      mimeType: 'image/jpeg',
      viewport: { width: 1440, height: 900 },
    });
    expect(readFileSync(file, 'utf8')).toBe('jpeg-bytes');
    await invoke(['browser-takeover', 'ada', '--enabled'], live.url);
    await invoke(['browser-takeover', 'ada', '--disabled'], live.url);
    await invoke(['browser-stop', 'ada'], live.url);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/browser/open', { slug: 'ada' }],
      ['GET', '/api/browser/frame?slug=ada', undefined],
      ['POST', '/api/browser/takeover', { slug: 'ada', active: true }],
      ['POST', '/api/browser/takeover', { slug: 'ada', active: false }],
      ['POST', '/api/browser/stop', { slug: 'ada' }],
    ]);
  });

  it('sends Human input to a paused Bot browser', async () => {
    const live = await host(() => ({ json: { ok: true, url: 'https://a.test/', title: 'A' } }));
    expect(
      (
        await invokeWithStdin(
          ['browser-input', 'ada', '--args-stdin'],
          live.url,
          '{"kind":"click","x":12,"y":34}',
        )
      ).json,
    ).toEqual({ ok: true, url: 'https://a.test/', title: 'A' });
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/browser/input', { kind: 'click', x: 12, y: 34, slug: 'ada' }],
    ]);
  });

  it('reports a Host refusal from a browser or Computer route as a coded error', async () => {
    const live = await host(() => ({
      status: 409,
      json: { ok: false, code: 'target-changed', error: 'Computer Target changed' },
    }));
    const result = await invoke(['computer-start'], live.url);
    expect(result.code).not.toBe(0);
    expect(result.json.error).toEqual({
      code: 'target-changed',
      message: 'Computer Target changed',
    });
    const browser = await host(() => ({
      status: 404,
      json: { ok: false, error: 'browser not running' },
    }));
    expect(
      (await invoke(['browser-frame', 'ada', '--out', '/tmp/x.jpg'], browser.url)).json.error.code,
    ).toBe('host-refused');
  });

  it('starts, reads and stops the Computer with explicit authorization', async () => {
    const live = await host((call) => ({
      json:
        call.path === '/api/computer/status'
          ? { target: 'local', status: { state: 'running' } }
          : { ok: true },
    }));
    await invoke(['computer-start', '--target', 'local'], live.url);
    expect((await invoke(['computer-status'], live.url)).json).toEqual({
      target: 'local',
      status: { state: 'running' },
    });
    await invoke(['computer-stop'], live.url);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/computer/start', { authorize: true, target: 'local' }],
      ['GET', '/api/computer/status', undefined],
      ['POST', '/api/computer/stop', { authorize: true }],
    ]);
  });

  it('lists Browser tools and runs one directly, saving an image result to a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-tool-'));
    dirs.push(dir);
    const live = await host((call) => ({
      json:
        call.path === '/api/browser/tools'
          ? { ok: true, tools: [{ name: 'browser_open', description: 'Open', inputSchema: {} }] }
          : (call.body as { tool: string }).tool === 'browser_screenshot'
            ? {
                ok: true,
                content: [
                  { type: 'text', text: 'Saved screenshot' },
                  {
                    type: 'image',
                    mimeType: 'image/png',
                    data: Buffer.from('png-bytes').toString('base64'),
                  },
                ],
              }
            : { ok: true, content: [{ type: 'text', text: 'Opened https://example.com' }] },
    }));
    expect((await invoke(['browser-tools'], live.url)).json.tools[0].name).toBe('browser_open');
    const stdin = '{"url":"https://example.com"}';
    const opened = await invokeWithStdin(
      ['browser-tool', 'ada', 'browser_open', '--args-stdin'],
      live.url,
      stdin,
    );
    expect(opened.json).toEqual({
      ok: true,
      content: [{ type: 'text', text: 'Opened https://example.com' }],
    });
    const file = join(dir, 'shot.png');
    const shot = await invokeWithStdin(
      ['browser-tool', 'ada', 'browser_screenshot', '--out', file],
      live.url,
      '',
    );
    expect(shot.json.content).toEqual([
      { type: 'text', text: 'Saved screenshot' },
      { type: 'image', mimeType: 'image/png', path: file, bytes: 9 },
    ]);
    expect(readFileSync(file, 'utf8')).toBe('png-bytes');
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['GET', '/api/browser/tools', undefined],
      [
        'POST',
        '/api/browser/tool',
        { slug: 'ada', tool: 'browser_open', args: { url: 'https://example.com' } },
      ],
      ['POST', '/api/browser/tool', { slug: 'ada', tool: 'browser_screenshot', args: {} }],
    ]);
    expect(
      (
        await invokeWithStdin(
          ['browser-tool', 'ada', 'browser_open', '--args-stdin'],
          live.url,
          '[1]',
        )
      ).json.error.code,
    ).toBe('usage');
    expect((await invokeWithStdin(['browser-tool', 'ada'], live.url, '')).json.error.code).toBe(
      'usage',
    );
    expect(live.calls).toHaveLength(3);
  });

  it('lists Computer tools and runs one directly for a Bot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-ctool-'));
    dirs.push(dir);
    const live = await host((call) => ({
      json:
        call.path === '/api/computer/tools'
          ? { ok: true, tools: [{ name: 'computer_click', description: 'Click', inputSchema: {} }] }
          : {
              ok: true,
              result: {
                content: [
                  {
                    type: 'image',
                    mimeType: 'image/png',
                    data: Buffer.from('desk').toString('base64'),
                  },
                ],
              },
            },
    }));
    expect((await invoke(['computer-tools'], live.url)).json.tools[0].name).toBe('computer_click');
    const file = join(dir, 'desk.png');
    const shot = await invokeWithStdin(
      ['computer-tool', 'ada', 'computer_screenshot', '--out', file],
      live.url,
      '',
    );
    expect(shot.json.result.content).toEqual([
      { type: 'image', mimeType: 'image/png', path: file, bytes: 4 },
    ]);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['GET', '/api/computer/tools', undefined],
      ['POST', '/api/computer/tool', { slug: 'ada', tool: 'computer_screenshot', args: {} }],
    ]);
  });

  it("reads a Bot's recent tool-call trace from the live Host", async () => {
    const live = await host(() => ({
      json: { ok: true, value: { slug: 'ada', sessionId: 's1', turns: [] } },
    }));
    expect((await invoke(['bot-trace', 'ada'], live.url)).json).toEqual({
      slug: 'ada',
      sessionId: 's1',
      turns: [],
    });
    await invoke(['bot-trace', 'ada', '--turns', '5', '--session', 's1'], live.url);
    expect(live.calls.map((call) => [call.path, call.body])).toEqual([
      ['botToolTrace', { slug: 'ada' }],
      ['botToolTrace', { slug: 'ada', sessionId: 's1', turns: 5 }],
    ]);
    for (const argv of [
      ['bot-trace'],
      ['bot-trace', 'ada', '--turns', '0'],
      ['bot-trace', 'ada', '--turns', 'x'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(2);
  });

  it('lists workspace grants from a live Host', async () => {
    const live = await host(() => ({ json: { ok: true, value: { grants: [{ id: 'g1' }] } } }));
    expect((await invoke(['grants', 'ada'], live.url)).json).toEqual({ grants: [{ id: 'g1' }] });
    expect(live.calls).toEqual([{ method: 'POST', path: 'grants', body: { slug: 'ada' } }]);
  });

  it('refuses incomplete commands before contacting the Host', async () => {
    const live = await host(() => ({ json: {} }));
    for (const argv of [
      ['browser-frame', 'ada'],
      ['browser-frame', 'ada', '--out', 'relative.jpg'],
      ['browser-takeover', 'ada'],
      ['browser-input', 'ada'],
      ['computer-start', '--target', 'cloud'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });
});

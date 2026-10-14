import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
type Answer = { status?: number; json?: unknown; bytes?: Buffer };

async function host(route: (call: Call) => Answer) {
  const calls: Call[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    if (req.method === 'GET' && url.searchParams.has('token') && url.pathname === '/') {
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    let parsed: unknown = text === '' ? undefined : text;
    try {
      parsed = JSON.parse(text);
    } catch {
      void 0;
    }
    const rpc = (parsed as { type?: string } | undefined)?.type === 'client-request';
    const envelope = parsed as { method: string; rpcId: string; payload: { args: unknown } };
    const call: Call = {
      method: req.method!,
      path: rpc ? envelope.method.replace('botharness/', '') : url.pathname + url.search,
      body: rpc ? envelope.payload.args : parsed,
    };
    calls.push(call);
    const answer = route(call);
    if (rpc) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: answer.json }),
      );
      return;
    }
    if (answer.bytes !== undefined) {
      res.writeHead(answer.status ?? 200, { 'content-type': 'application/x-tar' });
      res.end(answer.bytes);
      return;
    }
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.json ?? { ok: true }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url: string, stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(out) as Record<string, unknown> };
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'bh-cli-bc-'));
  dirs.push(dir);
  return dir;
}

describe('Browser observation, takeover audit and profile commands', () => {
  it('reads the observation and saves its picture instead of printing it', async () => {
    const out = join(scratch(), 'frame.png');
    const live = await host(() => ({
      json: {
        ok: true,
        running: true,
        frame: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
        focused: 'tab-2',
        tabs: [{ tabId: 'tab-2', url: 'https://example.com' }],
      },
    }));
    const result = await invoke(
      ['browser-observation', 'ada', '--tab', 'tab-2', '--out', out],
      live.url,
    );
    expect(result.json).toMatchObject({
      running: true,
      focused: 'tab-2',
      frame: { mimeType: 'image/png', bytes: 9, path: out },
    });
    expect(readFileSync(out, 'utf8')).toBe('png-bytes');
    const summary = await invoke(['browser-observation', 'ada'], live.url);
    expect(summary.json['frame']).toEqual({ mimeType: 'image/png', bytes: 9 });
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/browser/observation?slug=ada&tab=tab-2',
      '/api/browser/observation?slug=ada',
    ]);
  });

  it('reads the takeover audit and one recording with its token from stdin', async () => {
    const live = await host((call) =>
      call.path.startsWith('/api/browser/takeover/audit')
        ? { json: { ok: true, events: [{ at: 1, kind: 'mint', detail: 'login' }] } }
        : { json: { ok: true, slug: 'ada', state: 'completed', events: [] } },
    );
    expect((await invoke(['browser-takeover-audit', 'ada'], live.url)).json).toEqual({
      ok: true,
      events: [{ at: 1, kind: 'mint', detail: 'login' }],
    });
    expect(
      (await invoke(['browser-takeover-recording', '--token-stdin'], live.url, 'abc123\n')).json,
    ).toMatchObject({ slug: 'ada', state: 'completed' });
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/browser/takeover/audit?slug=ada',
      '/api/browser/takeover/recording?token=abc123',
    ]);
    const refused = await invoke(['browser-takeover-recording'], live.url);
    expect(refused.code).toBe(2);
    expect(refused.json['error']).toMatchObject({ code: 'usage' });
  });

  it("sets a Bot's Browser profile through the bridge owner", async () => {
    const live = await host(() => ({ json: { ok: true, value: { bot: { slug: 'ada' } } } }));
    const result = await invoke(['browser-profile-set', 'ada', '--profile', 'work'], live.url);
    expect(result.json).toEqual({ bot: { slug: 'ada' } });
    expect(live.calls).toEqual([
      { method: 'POST', path: 'browserProfileSet', body: { slug: 'ada', profile: 'work' } },
    ]);
    expect((await invoke(['browser-profile-set', 'ada'], live.url)).code).toBe(2);
  });
});

describe('Package installs', () => {
  it('refuses without --confirm and reports the Host refusal with its code', async () => {
    const live = await host(() => ({
      status: 403,
      json: { ok: false, code: 'needs-administrator', error: 'administrator rights required' },
    }));
    const missing = await invoke(['browser-install-packages', '--package', 'libnss3'], live.url);
    expect(missing.code).toBe(2);
    expect(live.calls).toEqual([]);
    const refused = await invoke(
      ['browser-install-packages', '--package', 'libnss3', '--confirm'],
      live.url,
    );
    expect(refused.json['error']).toEqual({
      code: 'needs-administrator',
      message: 'administrator rights required',
    });
    expect(live.calls[0]).toEqual({
      method: 'POST',
      path: '/api/browser/install-packages',
      body: { authorize: true, packages: ['libnss3'] },
    });
  });

  it('starts an install and waits until it settles', async () => {
    let reads = 0;
    const live = await host((call) => {
      if (call.method === 'POST') return { json: { ok: true, started: true } };
      reads += 1;
      return {
        json: {
          target: 'local',
          install: { state: reads < 2 ? 'installing' : 'installed', packages: ['xvfb'] },
        },
      };
    });
    const result = await invoke(['computer-install-packages', '--confirm', '--wait'], live.url);
    expect(result.json['install']).toEqual({ state: 'installed', packages: ['xvfb'] });
    expect(live.calls.map((call) => [call.method, call.path])).toEqual([
      ['POST', '/api/computer/install-packages'],
      ['GET', '/api/computer/status'],
      ['GET', '/api/computer/status'],
    ]);
    expect(live.calls[0]!.body).toEqual({ authorize: true });
  });

  it('reads Browser package access', async () => {
    const live = await host(() => ({ json: { ok: true, access: 'sudo' } }));
    expect((await invoke(['browser-packages'], live.url)).json).toEqual({
      ok: true,
      access: 'sudo',
    });
  });
});

describe('Computer diagnostics and logs', () => {
  it('reads diagnostics and filtered logs', async () => {
    const live = await host(() => ({ json: { ok: true, events: [], entries: [] } }));
    await invoke(['computer-diagnostics'], live.url);
    await invoke(
      ['computer-logs', '--bot', 'ada', '--plugin', 'botharness-computer', '--limit', '20'],
      live.url,
    );
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/computer/diagnostics',
      '/api/computer/logs?plugin=botharness-computer&owner=bot%3Aada&limit=20',
    ]);
    expect((await invoke(['computer-logs', '--limit', 'many'], live.url)).code).toBe(2);
  });
});

describe('Container Computer transfer', () => {
  it('exports and downloads an archive without printing the download token', async () => {
    const out = join(scratch(), 'computer.tar');
    const live = await host((call) =>
      call.path.startsWith('/api/computer/download')
        ? { bytes: Buffer.from('tar-bytes') }
        : {
            json: {
              ok: true,
              archive: '/exports/computer-1.tar',
              downloadToken: 'one-time-download',
            },
          },
    );
    const result = await invoke(['computer-export', '--dir', '/exports', '--out', out], live.url);
    expect(result.json).toEqual({
      ok: true,
      archive: '/exports/computer-1.tar',
      download: { path: out, bytes: 9 },
    });
    expect(JSON.stringify(result.json)).not.toContain('one-time-download');
    expect(readFileSync(out, 'utf8')).toBe('tar-bytes');
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/computer/export', { authorize: true, dir: '/exports' }],
      ['GET', '/api/computer/download?token=one-time-download', undefined],
    ]);
  });

  it('uploads a local archive, lists it, and imports it only with --confirm', async () => {
    const file = join(scratch(), 'backup.tar');
    writeFileSync(file, 'archive-content');
    const live = await host((call) => {
      if (call.path === '/api/computer/upload') return { json: { ok: true, uploadToken: 'up-1' } };
      if (call.path === '/api/computer/exports')
        return { json: { ok: true, files: ['backup.tar'] } };
      return { json: { ok: true } };
    });
    expect((await invoke(['computer-upload', file], live.url)).json).toEqual({
      ok: true,
      file: 'backup.tar',
      bytes: 15,
    });
    expect((await invoke(['computer-exports'], live.url)).json).toEqual({
      ok: true,
      files: ['backup.tar'],
    });
    expect((await invoke(['computer-import', 'backup.tar'], live.url)).code).toBe(2);
    await invoke(['computer-import', 'backup.tar', '--confirm'], live.url);
    await invoke(['computer-open-dir'], live.url);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/computer/upload', { authorize: true, file: 'backup.tar' }],
      ['POST', '/api/computer/upload-content?token=up-1', 'archive-content'],
      ['GET', '/api/computer/exports', undefined],
      ['POST', '/api/computer/import', { authorize: true, file: 'backup.tar' }],
      ['POST', '/api/computer/open-dir', { authorize: true }],
    ]);
  });

  it('refuses unsafe archive names and relative paths before calling the Host', async () => {
    const live = await host(() => ({ json: { ok: true } }));
    expect((await invoke(['computer-import', '../x.tar', '--confirm'], live.url)).code).toBe(2);
    expect((await invoke(['computer-upload', 'relative.tar'], live.url)).code).toBe(2);
    expect((await invoke(['computer-export', '--out', 'out.tar'], live.url)).code).toBe(2);
    expect(live.calls).toEqual([]);
  });
});

function frame(text: string): Buffer {
  const payload = Buffer.from(text);
  const header =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

function readFrames(buffer: Buffer): string[] {
  const texts: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset]! & 0x0f;
    let length = buffer[offset + 1]! & 0x7f;
    let at = offset + 2;
    if (length === 126) {
      length = buffer.readUInt16BE(at);
      at += 2;
    }
    const mask = buffer.subarray(at, at + 4);
    const data = Buffer.from(buffer.subarray(at + 4, at + 4 + length));
    for (let index = 0; index < data.length; index += 1) data[index]! ^= mask[index % 4]!;
    if (opcode === 1) texts.push(data.toString());
    offset = at + 4 + length;
  }
  return texts;
}

function selkiesSignaling(server: ReturnType<typeof createServer>, seen: string[]) {
  server.on('upgrade', (req: IncomingMessage, socket) => {
    seen.push(`${req.url ?? ''} cookie=${String(req.headers.cookie)}`);
    const accept = createHash('sha1')
      .update(`${String(req.headers['sec-websocket-key'])}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let sessions = 0;
    socket.on('data', (chunk: Buffer) => {
      if ((chunk[0]! & 0x0f) === 8) return void socket.destroy();
      for (const text of readFrames(chunk)) {
        seen.push(text);
        if (text.startsWith('HELLO client ')) socket.write(frame('HELLO'));
        if (text === 'SESSION server') {
          sessions += 1;
          if (sessions === 1) socket.write(frame('ERROR peer server not found'));
          else {
            socket.write(frame('SESSION_OK server-1'));
            const sdp = [
              'v=0',
              'a=ice-lite',
              'm=video 39002 UDP/TLS/RTP/SAVPF 96',
              'a=candidate:1 1 udp 2130706431 100.101.102.103 39002 typ host',
              'a=candidate:1 1 udp 2130706431 100.101.102.103 39002 typ host',
            ].join('\r\n');
            socket.write(frame(`server-1 ${JSON.stringify({ sdp: { type: 'offer', sdp } })}`));
          }
        }
      }
    });
    socket.on('error', () => undefined);
  });
}

describe('WebRTC commands', () => {
  it('reads Computer WebRTC status and probes signalling up to the offer', async () => {
    const seen: string[] = [];
    const live = await host(() => ({
      json: {
        signaling: '/api/computer/webrtc/signaling',
        available: true,
        transport: 'webrtc',
        address: '100.101.102.103',
        port: 39_002,
        iceServers: [],
        calls: 0,
      },
    }));
    selkiesSignaling(servers.at(-1)!, seen);
    expect((await invoke(['computer-webrtc'], live.url)).json).toMatchObject({ available: true });
    const probed = await invoke(['computer-webrtc', '--probe'], live.url);
    expect(probed.json['probe']).toMatchObject({
      ok: true,
      offer: true,
      iceLite: true,
      candidates: [{ protocol: 'udp', address: '100.101.102.103', port: 39_002, type: 'host' }],
    });
    expect(seen[0]).toBe('/api/computer/webrtc/signaling cookie=authority=signed');
    expect(seen.filter((line) => line === 'SESSION server')).toHaveLength(2);
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/computer/webrtc',
      '/api/computer/webrtc',
    ]);
  });

  it('skips the probe when the Host reports WebRTC unavailable', async () => {
    const viewer = 'a'.repeat(24);
    const live = await host(() => ({
      json: { viewer, available: false, code: 'tailnet-unavailable', fallback: 'websocket' },
    }));
    const result = await invoke(['browser-webrtc', '--viewer', viewer, '--probe'], live.url);
    expect(result.json).toEqual({
      viewer,
      available: false,
      code: 'tailnet-unavailable',
      fallback: 'websocket',
    });
    expect(live.calls.map((call) => call.path)).toEqual([`/api/browser/webrtc?viewer=${viewer}`]);
  });

  it('needs a Container Browser viewer id', async () => {
    const live = await host(() => ({ json: {} }));
    const result = await invoke(['browser-webrtc'], live.url);
    expect(result.code).not.toBe(0);
    expect(live.calls).toEqual([]);
  });
});

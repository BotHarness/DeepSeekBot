import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

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

type Call = { path: string; body: unknown };

async function host(answer: (call: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const server = createServer(
    requestListener(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, 'http://localhost');
      if (req.method === 'GET' && url.searchParams.has('token') && url.pathname === '/') {
        res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      const call = {
        path: url.pathname,
        body: text === '' ? undefined : JSON.parse(text),
      };
      calls.push(call);
      const { status, json } = answer(call);
      res.writeHead(status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url: string) {
  const stdout: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: {
      DEEPSEEKBOT_HOST: url,
      DEEPSEEKBOT_HOST_TOKEN: 'private-test-token',
    },
    stdout: (text) => stdout.push(text),
    stderr: () => {},
  });
  return {
    code,
    out: stdout.join(''),
    json: JSON.parse(stdout.join('')) as Record<string, unknown>,
  };
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'bh-cli-pair-'));
  dirs.push(dir);
  return dir;
}

describe('Browser pairing, Daily Browser and borrowed Browser commands', () => {
  it.each([
    [['browser-profile-forget'], '/api/browser/profile/forget', {}],
    [['browser-daily-connect', 'ada'], '/api/browser/daily/connect', { slug: 'ada' }],
    [['browser-daily-grant', 'ada'], '/api/browser/daily/grant', { slug: 'ada' }],
    [['browser-daily-return', 'ada'], '/api/browser/daily/return', { slug: 'ada' }],
    [['browser-borrow-return', 'ada'], '/api/browser/borrow/return', { slug: 'ada' }],
  ])('%s posts to the same route as the Browser panel', async (argv, path, body) => {
    const live = await host(() => ({ json: { ok: true } }));
    const result = await invoke(argv, live.url);
    expect(result.code).toBe(0);
    expect(result.json).toEqual({ ok: true });
    expect(live.calls).toEqual([{ path, body }]);
  });

  it.each([
    [['browser-profile-pair'], '/api/browser/profile/pair', {}],
    [['browser-borrow-pair', 'ada'], '/api/browser/borrow/pair', { slug: 'ada' }],
  ])('%s writes the pairing code only to a new private file', async (argv, path, body) => {
    const live = await host(() => ({
      json: { ok: true, code: 'K7Q-PAIR', expiresAt: 42 },
    }));
    const file = join(scratch(), 'code');
    const result = await invoke([...argv, '--out', file], live.url);
    expect(result.code).toBe(0);
    expect(result.json).toEqual({ ok: true, expiresAt: 42, codeFile: file });
    expect(result.out).not.toContain('K7Q-PAIR');
    expect(readFileSync(file, 'utf8')).toBe('K7Q-PAIR');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(live.calls).toEqual([{ path, body }]);
  });

  it('refuses a pairing without a private file, and never overwrites an existing one', async () => {
    const live = await host(() => ({
      json: { ok: true, code: 'K7Q-PAIR', expiresAt: 42 },
    }));
    const missing = await invoke(['browser-borrow-pair', 'ada'], live.url);
    expect(missing.code).not.toBe(0);
    expect(missing.json['error']).toMatchObject({ code: 'usage' });
    expect(live.calls).toEqual([]);
    const file = join(scratch(), 'taken');
    writeFileSync(file, 'old');
    const taken = await invoke(['browser-profile-pair', '--out', file], live.url);
    expect(taken.json['error']).toMatchObject({ code: 'pairing-file-failed' });
    expect(taken.out).not.toContain('K7Q-PAIR');
    expect(readFileSync(file, 'utf8')).toBe('old');
  });

  it('keeps the Host refusal message for a Daily Browser grant before a page is selected', async () => {
    const live = await host(() => ({
      status: 409,
      json: {
        ok: false,
        error: 'Select one page in the Playwright extension first',
      },
    }));
    const result = await invoke(['browser-daily-grant', 'ada'], live.url);
    expect(result.code).not.toBe(0);
    expect(result.json['error']).toMatchObject({
      code: 'host-refused',
      message: 'Select one page in the Playwright extension first',
    });
  });

  it('needs exactly one bot id for the per-Bot commands', async () => {
    const live = await host(() => ({ json: { ok: true } }));
    for (const argv of [['browser-daily-connect'], ['browser-borrow-return', 'a', 'b']]) {
      const result = await invoke(argv, live.url);
      expect(result.json['error']).toMatchObject({ code: 'usage' });
    }
    expect(live.calls).toEqual([]);
  });
});

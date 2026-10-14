import { rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

describe('to-do plugin commands', () => {
  it('lists, adds, updates and removes to-dos through the plugin routes', async () => {
    const live = await host((call) => ({
      json: { ok: true, path: call.path, body: call.body ?? null },
    }));
    expect((await invoke(['todos'], live.url)).json).toMatchObject({ path: '/api/todos' });
    expect((await invoke(['todo-add', '--title', ' Buy milk '], live.url)).json).toMatchObject({
      body: { title: 'Buy milk' },
    });
    await invoke(['todo-update', 't1', '--done'], live.url);
    await invoke(['todo-update', 't1', '--title', 'Oat milk', '--not-done'], live.url);
    await invoke(['todo-remove', 't1'], live.url);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['GET', '/api/todos', undefined],
      ['POST', '/api/todos/add', { title: 'Buy milk' }],
      ['POST', '/api/todos/update', { id: 't1', done: true }],
      ['POST', '/api/todos/update', { id: 't1', title: 'Oat milk', done: false }],
      ['POST', '/api/todos/remove', { id: 't1' }],
    ]);
  });

  it('runs a to-do Bot tool directly with arguments from stdin', async () => {
    const live = await host((call) => ({ json: { ok: true, echo: call.body ?? null } }));
    await invoke(['todo-tools'], live.url);
    const run = await invoke(
      ['todo-tool', 'ada', 'todos_add', '--args-stdin'],
      live.url,
      '{"title":"Water plants"}',
    );
    expect(run.json).toMatchObject({
      echo: { slug: 'ada', tool: 'todos_add', args: { title: 'Water plants' } },
    });
    expect(live.calls.map((call) => call.path)).toEqual(['/api/todos/tools', '/api/todos/tool']);
  });

  it('refuses bad usage before calling the Host', async () => {
    const live = await host(() => ({ json: { ok: true } }));
    for (const argv of [
      ['todo-add'],
      ['todo-update', 't1'],
      ['todo-update', 't1', '--done', '--not-done'],
      ['todo-remove'],
      ['todo-tool', 'ada'],
    ]) {
      const result = await invoke(argv, live.url);
      expect(result.code).not.toBe(0);
      expect(result.json).toMatchObject({ error: { code: 'usage' } });
    }
    expect(live.calls).toEqual([]);
  });

  it('names the missing plugin and passes plugin codes through', async () => {
    const missing = await host(() => ({ status: 404, json: 'Not Found' }));
    expect((await invoke(['todos'], missing.url)).json).toMatchObject({
      error: { code: 'todo-plugin-missing' },
    });
    const unknown = await host(() => ({
      status: 404,
      json: { ok: false, code: 'todo-not-found', error: 'Unknown to-do: t9' },
    }));
    expect((await invoke(['todo-remove', 't9'], unknown.url)).json).toMatchObject({
      error: { code: 'todo-not-found', message: 'Unknown to-do: t9' },
    });
  });
});

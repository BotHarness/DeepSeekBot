import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodexEngineSession, type CodexTransport } from '../src/engines/codex-engine.js';
import { codexLoginUrl, startCodexLogin } from '../src/engines/codex-status.js';
import { createEngineGateway, type EngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { engineLaunch } from '../src/engines/engine-launch.js';
import { EngineRefusal } from '../src/engines/engine-session.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { createTempRoot } from './helpers.js';
import { inboxFixture } from './inbox-fixture.js';

type Reply = { result: unknown } | { error: string } | 'hang';
type Handler = (params: Record<string, unknown>, codex: FakeCodex) => Reply;

interface FakeCodex {
  transport: CodexTransport;
  sent: Array<Record<string, unknown>>;
  methods(): string[];
  notify(method: string, params: unknown): void;
  exit(detail: string): void;
  closed: boolean;
}

function fakeCodex(overrides: Record<string, Handler> = {}): FakeCodex {
  const listeners: Array<(message: unknown) => void> = [];
  const exits: Array<(detail: string) => void> = [];
  const handlers: Record<string, Handler> = {
    initialize: () => ({ result: {} }),
    'account/read': () => ({ result: { account: { type: 'chatgpt', planType: 'pro' } } }),
    'thread/start': () => ({ result: { thread: { id: 'thread-new' } } }),
    'thread/resume': (params) => ({ result: { thread: { id: params['threadId'] } } }),
    'turn/start': (_params, codex) => {
      setTimeout(() => codex.notify('turn/completed', { turn: { status: 'completed' } }), 5);
      return { result: { turn: { id: 'turn-1' } } };
    },
    'turn/interrupt': (_params, codex) => {
      setTimeout(() => codex.notify('turn/completed', { turn: { status: 'interrupted' } }), 5);
      return { result: {} };
    },
    ...overrides,
  };
  const codex: FakeCodex = {
    sent: [],
    closed: false,
    methods: () => codex.sent.map((message) => String(message['method'])),
    notify: (method, params) => {
      for (const listener of listeners) listener({ method, params });
    },
    exit: (detail) => {
      for (const listener of exits.splice(0)) listener(detail);
    },
    transport: {
      send: (message) => {
        const sent = message as Record<string, unknown>;
        codex.sent.push(sent);
        const method = sent['method'];
        if (typeof method !== 'string' || sent['id'] === undefined) return;
        const reply = (handlers[method] ?? (() => ({ result: {} })))(
          (sent['params'] ?? {}) as Record<string, unknown>,
          codex,
        );
        if (reply === 'hang') return;
        setTimeout(() => {
          for (const listener of listeners)
            listener(
              'error' in reply
                ? { id: sent['id'], error: { message: reply.error } }
                : { id: sent['id'], result: reply.result },
            );
        }, 1);
      },
      onMessage: (listener) => void listeners.push(listener),
      onExit: (listener) => void exits.push(listener),
      close: async () => {
        if (codex.closed) return;
        codex.closed = true;
        codex.exit('codex app-server exited (SIGTERM)');
      },
    },
  };
  return codex;
}

const gateways: EngineGateway[] = [];
afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function hostWith(next: () => FakeCodex) {
  const dsh = memoryDsh();
  const gateway = createEngineGateway();
  gateways.push(gateway);
  const opened: FakeCodex[] = [];
  const states: string[] = [];
  const host = new EngineHost({
    root: createTempRoot('engine-recovery-'),
    local: true,
    gateway,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    releaseGraceMs: 50,
    observe: (_bot, _session, state) => states.push(state),
    openCodex: () => {
      const codex = next();
      opened.push(codex);
      return codex.transport;
    },
  });
  host.use('ada', 'orchestrator', 'codex');
  const request = (signal = new AbortController().signal, channelId = 'dm-ada') => ({
    botSlug: 'ada',
    sessionId: 'orchestrator-ada',
    channelId,
    input: 'Hi Ada',
    instructions: 'You are Ada.',
    tools: [],
    execute: async () => 'ok',
    signal,
  });
  return { host, opened, states, request, dsh };
}

describe('Codex Engine Session stop and timeouts', () => {
  async function started(codex: FakeCodex, timeout?: number) {
    const session = new CodexEngineSession(codex.transport, {
      cwd: '/tmp',
      instructions: '',
      ...(timeout === undefined ? {} : { requestTimeoutMs: timeout }),
    });
    await session.start();
    return session;
  }

  it('does not start a turn whose signal is already aborted', async () => {
    const codex = fakeCodex();
    const session = await started(codex);
    const stop = new AbortController();
    stop.abort();
    await expect(
      session.send('hi', { onEvent: () => undefined, signal: stop.signal }),
    ).resolves.toEqual({ status: 'interrupted' });
    expect(codex.methods()).not.toContain('turn/start');
  });

  it('interrupts the acknowledged turn by its id, even when Stop arrived first', async () => {
    const codex = fakeCodex({ 'turn/start': () => ({ result: { turn: { id: 'turn-7' } } }) });
    const session = await started(codex);
    const stop = new AbortController();
    const ended = session.send('hi', { onEvent: () => undefined, signal: stop.signal });
    stop.abort();
    await vi.waitFor(() => expect(codex.methods()).toContain('turn/interrupt'));
    const interrupt = codex.sent.find((message) => message['method'] === 'turn/interrupt')!;
    expect(interrupt['params']).toEqual({ threadId: 'thread-new', turnId: 'turn-7' });
    await expect(ended).resolves.toEqual({ status: 'interrupted' });
  });

  it('gives up on a request Codex never answers and closes the process', async () => {
    const codex = fakeCodex({ 'turn/start': () => 'hang' });
    const session = await started(codex, 30);
    const end = await session.send('hi', { onEvent: () => undefined });
    expect(end.status).toBe('failed');
    expect(codex.closed).toBe(true);
    expect(session.ended).toBe(true);
  });

  it('starts a new thread only when Codex says the old one is gone', async () => {
    const missing = new CodexEngineSession(
      fakeCodex({ 'thread/resume': () => ({ error: 'thread not found: t-1' }) }).transport,
      { cwd: '/tmp', instructions: '' },
    );
    await expect(missing.start('t-1')).rejects.toMatchObject({ code: 'engine-thread-gone' });
    const busy = new CodexEngineSession(
      fakeCodex({ 'thread/resume': () => ({ error: 'rollout file is locked' }) }).transport,
      { cwd: '/tmp', instructions: '' },
    );
    await expect(busy.start('t-1')).rejects.toMatchObject({ code: 'engine-failed' });
  });
});

describe('Engine Host recovery', () => {
  it('keeps the stored thread on a transient resume failure and replaces it only when gone', async () => {
    let resume: Handler = () => ({ error: 'rollout file is locked' });
    const { host, request } = hostWith(() =>
      fakeCodex({ 'thread/resume': (params, codex) => resume(params, codex) }),
    );
    host.store.rememberNativeSession('orchestrator-ada', 'codex', 'thread-old', 'ChatGPT pro');
    await expect(host.runTurn(request())).rejects.toMatchObject({ code: 'engine-failed' });
    expect(host.store.nativeSession('orchestrator-ada')?.nativeId).toBe('thread-old');
    resume = () => ({ error: 'thread not found' });
    await host.runTurn(request());
    expect(host.store.nativeSession('orchestrator-ada')?.nativeId).toBe('thread-new');
    await host.close();
  });

  it('reopens and resumes the thread after Codex exits between turns', async () => {
    const { host, opened, request } = hostWith(() => fakeCodex());
    await host.runTurn(request());
    opened[0]!.exit('codex app-server exited (1)');
    await host.runTurn(request());
    expect(opened).toHaveLength(2);
    expect(opened[1]!.methods()).toContain('thread/resume');
    expect(opened[1]!.methods().filter((method) => method === 'turn/start')).toHaveLength(1);
    await host.close();
  });

  it('releases a Session whose turn hangs, so the next turn can reopen it', async () => {
    const { host, opened, request } = hostWith(() =>
      fakeCodex({
        'turn/start': () => ({ result: { turn: { id: 'turn-1' } } }),
        'turn/interrupt': () => 'hang',
      }),
    );
    const turn = host.runTurn(request()).catch((error: unknown) => error);
    await vi.waitFor(() => expect(opened[0]?.methods()).toContain('turn/start'));
    await host.release('orchestrator-ada');
    expect(opened[0]!.closed).toBe(true);
    await turn;
    expect(host.isLive('orchestrator-ada')).toBe(false);
  });

  it('runs queued turns in arrival order, each with its own Channel scope', async () => {
    const order: string[] = [];
    const { host, request } = hostWith(() => fakeCodex());
    const turn = (channel: string) =>
      host
        .runTurn({ ...request(undefined, channel), execute: async () => 'ok' })
        .then(() => order.push(channel));
    await Promise.all([turn('a'), turn('b'), turn('c')]);
    expect(order).toEqual(['a', 'b', 'c']);
    await host.close();
  });

  it('refuses a turn queued behind a release instead of running it on the closed Session', async () => {
    const { host, request } = hostWith(() =>
      fakeCodex({
        'turn/start': (_params, codex) => {
          setTimeout(() => codex.notify('turn/completed', { turn: { status: 'completed' } }), 40);
          return { result: { turn: { id: 'turn-1' } } };
        },
      }),
    );
    const first = host.runTurn(request());
    await vi.waitFor(() => expect(host.isLive('orchestrator-ada')).toBe(true));
    const queued = host.runTurn(request());
    await host.release('orchestrator-ada');
    await first.catch(() => undefined);
    await expect(queued).rejects.toBeInstanceOf(EngineRefusal);
  });

  it('cancels a Session still opening when the Host shuts down', async () => {
    const { host, opened, request } = hostWith(() => fakeCodex({ 'account/read': () => 'hang' }));
    const turn = host.runTurn(request()).catch((error: unknown) => error);
    await vi.waitFor(() => expect(opened[0]?.methods()).toContain('account/read'));
    await host.close();
    expect(await turn).toBeInstanceOf(Error);
    expect(opened[0]!.closed).toBe(true);
    expect(host.isLive('orchestrator-ada')).toBe(false);
    await expect(host.runTurn(request())).rejects.toMatchObject({ code: 'engine-unavailable' });
  });

  it('reports an account read that Codex rejects as a failure, not a missing install', async () => {
    const { host, request, states } = hostWith(() =>
      fakeCodex({ 'account/read': () => ({ error: 'auth store is corrupt' }) }),
    );
    await expect(host.runTurn(request())).rejects.toMatchObject({ code: 'engine-failed' });
    expect(states.at(-1)).toBe('idle');
    expect(host.describe('orchestrator-ada')).toBeUndefined();
  });

  it('reports a login status it cannot read as unknown, not signed out', async () => {
    const host = new EngineHost({
      root: createTempRoot('engine-status-'),
      local: true,
      gateway: createEngineGateway(),
      sessions: () => undefined,
      persistence: () => undefined,
      detectCodex: async () => ({ installed: true, version: '0.170.0', login: 'unknown' }),
    });
    expect(await host.status()).toEqual([
      expect.objectContaining({ available: false, reason: 'login-unknown', login: 'unknown' }),
    ]);
  });
});

describe('Engine gateway grants', () => {
  it('refuses the rest of a batch once the grant is revoked mid-request', async () => {
    const gateway = createEngineGateway();
    gateways.push(gateway);
    await gateway.start();
    const grant = gateway.grant({
      botSlug: 'ada',
      sessionId: 's',
      tools: [{ name: 'channel_read', description: '', inputSchema: { type: 'object' } }],
      channelId: () => 'dm-ada',
      call: async () => {
        grant.revoke();
        return { text: 'read', isError: false };
      },
    });
    const call = (id: number) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'channel_read', arguments: {} },
    });
    const response = await fetch(grant.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${grant.token}` },
      body: JSON.stringify([call(1), call(2)]),
    });
    const replies = (await response.json()) as Array<Record<string, unknown>>;
    expect(replies[0]).toHaveProperty('result');
    expect(replies[1]).toMatchObject({ error: { code: -32001 } });
  });

  it('binds one listener when two Sessions start the gateway at once', async () => {
    const gateway = createEngineGateway();
    gateways.push(gateway);
    const [first, second] = await Promise.all([gateway.start(), gateway.start()]);
    expect(first).toBe(second);
  });
});

describe('Codex launch and sign-in', () => {
  it('runs a Windows .cmd shim through cmd.exe and a native executable directly', () => {
    const env = { Path: 'C:\\npm;C:\\bin', PATHEXT: '.EXE;.CMD', ComSpec: 'C:\\Windows\\cmd.exe' };
    const shim = engineLaunch('codex', ['login', 'status'], {
      platform: 'win32',
      env,
      exists: (path) => path === 'C:\\npm\\codex.CMD',
    });
    expect(shim).toEqual({
      file: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', '"C:\\npm\\codex.CMD login status"'],
      windowsVerbatimArguments: true,
    });
    const native = engineLaunch('codex', ['--version'], {
      platform: 'win32',
      env,
      exists: (path) => path === 'C:\\bin\\codex.EXE',
    });
    expect(native).toEqual({ file: 'C:\\bin\\codex.EXE', args: ['--version'] });
    expect(engineLaunch('codex', ['--version'], { platform: 'darwin' })).toEqual({
      file: 'codex',
      args: ['--version'],
    });
  });

  it('reads the sign-in URL from a whole line and refuses a login that exits first', async () => {
    expect(codexLoginUrl('  https://auth.openai.com/oauth/authorize?a=1&b=2  ')).toBe(
      'https://auth.openai.com/oauth/authorize?a=1&b=2',
    );
    const root = createTempRoot('codex-login-');
    const script = join(root, 'codex');
    writeFileSync(
      script,
      '#!/usr/bin/env node\nprocess.stderr.write("Error: ChatGPT login is disabled\\n");\nprocess.exit(1);\n',
    );
    chmodSync(script, 0o755);
    await expect(
      startCodexLogin({ command: script, home: join(root, 'home') }),
    ).rejects.toMatchObject({
      code: 'engine-failed',
      message: expect.stringContaining('disabled'),
    });
  });
});

describe('Engine Channel scope for inbox_resolve', () => {
  it('refuses Inbox items from another Channel and resolves those in the granted one', async () => {
    const f = await inboxFixture();
    try {
      const outcomes: unknown[] = [];
      await f.send('Please check the build', (run) => {
        const ids = run.triage!.current();
        try {
          run.triage!.resolve({ ids, outcome: 'done', channelId: 'another-channel' });
        } catch (error) {
          outcomes.push((error as Error).message);
        }
        outcomes.push(run.triage!.resolve({ ids, outcome: 'done', channelId: f.dm.id }));
      });
      expect(outcomes[0]).toMatch(/channel-out-of-scope/u);
      expect(outcomes[1]).toMatchObject({ outcome: 'resolved' });
    } finally {
      await f.close();
    }
  }, 60000);
});

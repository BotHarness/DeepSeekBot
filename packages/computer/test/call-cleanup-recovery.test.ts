import { afterEach, expect, it, vi } from 'vitest';

import { createCallMedia } from '../src/media/call-supervisor.js';

const harness = vi.hoisted(() => ({
  mode: 'success',
  started: () => undefined as void,
  proof: () => undefined as void,
  exit: () => undefined as void,
  verify: async (_signal?: AbortSignal) => true,
  connection: (_value: object) => undefined as void,
}));

vi.mock('../src/media/install.js', async (original) => ({
  ...(await original<typeof import('../src/media/install.js')>()),
  verifyLocalVideoAssets: async () => undefined,
  verifyLocalVideoHelper: async (_directory: string, _assets: string, signal?: AbortSignal) =>
    harness.verify(signal),
}));

vi.mock('node:child_process', async (original) => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough, Writable } = await import('node:stream');
  return {
    ...(await original<typeof import('node:child_process')>()),
    spawn: (_file: string, args: string[]) => {
      const process = new EventEmitter();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const launchId = args[3];
      const envelope = (value: object) =>
        (Reflect.get(value, 'event') === 'helper-message' ? stdout : stderr).write(
          JSON.stringify({ ...value, launchId }) + '\n',
        );
      const helper = (value: object) =>
        envelope({ event: 'helper-message', json: JSON.stringify(value) });
      harness.connection = (value) => helper({ ...value, event: 'connection' });
      harness.proof = () => envelope({ event: 'tree-closed', version: 1, activeProcesses: 0 });
      harness.exit = () => {
        process.emit('exit', 0);
        process.emit('close', 0);
      };
      const close = () => {
        if (harness.mode === 'delayed') return;
        envelope({ event: 'tree-closed', version: 1, activeProcesses: 0 });
        process.emit('exit', 0);
        process.emit('close', 0);
      };
      const stdin = new Writable({
        write(chunk, _encoding, done) {
          const request = JSON.parse(String(chunk));
          if (request.op === 'close') queueMicrotask(close);
          else if (request.op === 'offer' && harness.mode !== 'offer-timeout')
            queueMicrotask(() =>
              helper({
                id: request.id,
                ok: true,
                value: {
                  offer: {
                    type: 'offer',
                    sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=private-sentinel\r\n',
                  },
                },
              }),
            );
          done();
        },
      });
      queueMicrotask(() => {
        envelope({ event: 'tree-owned', version: 1, rootPid: 123 });

        if (harness.mode !== 'ready-timeout') helper({ event: 'ready', version: 1 });
        harness.started();
      });
      return Object.assign(process, { stdin, stdout, stderr, pid: 122, kill: close });
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  harness.mode = 'success';
  harness.started = () => undefined;
  harness.verify = async () => true;
});

function setup(mode: string, enabled = true) {
  vi.stubEnv('BOTHARNESS_CALL_DIAGNOSTICS', enabled ? '1' : '');
  harness.mode = mode;
  let onStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    onStarted = resolve;
  });
  harness.started = onStarted;
  const events: string[] = [];
  const media = createCallMedia({
    platform: 'win32',
    arch: 'x64',
    onEvent: (event) => events.push(event),
  });
  const abort = new AbortController();
  const opening = media.open({
    callId: 'call-qa',
    signal: abort.signal,
    onPcm: () => undefined,
    onStatus: () => undefined,
  });
  const outcome = opening.then(
    (peer) => ({ peer }),
    () => ({ peer: undefined }),
  );
  return { events, started, abort, outcome, media };
}

it.each([true, false])(
  'binds peer diagnostics to this call without accepting control authority (enabled=%s)',
  async (enabled) => {
    const h = setup('success', enabled);
    const { peer } = await h.outcome;
    harness.connection({
      seq: 1,
      elapsedMs: 10,
      stage: 'ice',
      peer: 'connecting',
      ice: 'checking',
      gathering: 'complete',
      localCandidates: 2,
      remoteCandidates: 1,
      call: 'forged-call',
      sdp: 'private-sdp',
    });
    harness.connection({ seq: 2, elapsedMs: 20, stage: 'tree-closed', activeProcesses: 0 });
    const rows = h.events.filter((row) => row.includes('phase=call-media-connection'));
    expect(rows).toHaveLength(enabled ? 1 : 0);
    if (enabled) expect(rows[0]).toContain('call=call-qa');
    expect(h.events.join(' ')).not.toMatch(/forged-call|private-sdp/);
    await expect(
      h.media.open({
        callId: 'other',
        signal: new AbortController().signal,
        onPcm: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'busy' });
    await peer!.close();
  },
);

it('releases unspawned admission after verification cancellation settles', async () => {
  let entered!: () => void;
  const verifying = new Promise<void>((resolve) => {
    entered = resolve;
  });
  harness.verify = (signal) =>
    new Promise<boolean>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      entered();
    });
  const h = setup('success');
  await verifying;
  h.abort.abort();
  expect((await h.outcome).peer).toBeUndefined();
  harness.verify = async () => true;
  const next = await h.media.open({
    callId: 'next',
    signal: new AbortController().signal,
    onPcm: () => undefined,
    onStatus: () => undefined,
  });
  expect(next.offer?.type).toBe('offer');
  await next.close();
  expect(h.events.some((entry) => entry.includes('operation=open result=cancelled'))).toBe(true);
});

it.each(['proof-first', 'exit-first'])(
  'admits another call only after late dual cleanup proof: %s',
  async (order) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const h = setup('delayed');
    const { peer } = await h.outcome;
    expect(peer).toBeDefined();
    const closing = peer!.close().then(
      () => 'closed',
      () => 'refused',
    );
    await vi.advanceTimersByTimeAsync(2600);
    expect(await closing).toBe('refused');
    const open = () =>
      h.media.open({
        callId: 'next',
        signal: new AbortController().signal,
        onPcm: () => undefined,
        onStatus: () => undefined,
      });
    await expect(open()).rejects.toMatchObject({ code: 'busy' });
    if (order === 'proof-first') harness.proof();
    else harness.exit();
    await expect(open()).rejects.toMatchObject({ code: 'busy' });
    if (order === 'proof-first') harness.exit();
    else harness.proof();
    const staleProof = harness.proof;
    const staleExit = harness.exit;
    harness.mode = 'success';
    const next = await open();
    expect(h.events.some((entry) => entry.includes('phase=call-media-cleanup-recovered'))).toBe(
      true,
    );
    staleProof();
    staleExit();
    await expect(open()).rejects.toMatchObject({ code: 'busy' });
    await next.close();
  },
);

it('retains the busy refusal after launcher exit without trusted cleanup proof', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const h = setup('delayed');
  const { peer } = await h.outcome;
  const closing = peer!.close().catch(() => undefined);
  await vi.advanceTimersByTimeAsync(2600);
  await closing;
  harness.exit();
  await expect(
    h.media.open({
      callId: 'next',
      signal: new AbortController().signal,
      onPcm: () => undefined,
      onStatus: () => undefined,
    }),
  ).rejects.toMatchObject({ code: 'busy' });
  expect(
    h.events.some((entry) =>
      /phase=call-media-open-refused reason=busy .*exited=true .*treeStopped=false/u.test(entry),
    ),
  ).toBe(true);
});

it('accepts dual cleanup proof received within the existing post-kill wait', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const h = setup('delayed');
  const { peer } = await h.outcome;
  const closing = peer!.close().then(
    () => 'closed',
    () => 'refused',
  );
  await vi.advanceTimersByTimeAsync(2400);
  await vi.advanceTimersByTimeAsync(100);
  harness.proof();
  harness.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(await closing).toBe('closed');
  expect(h.events.some((entry) => entry.includes('phase=call-media-cleanup-refused'))).toBe(false);
  expect(h.events.some((entry) => entry.includes('phase=call-media-stopped'))).toBe(true);
  harness.mode = 'success';
  const next = await h.media.open({
    callId: 'next',
    signal: new AbortController().signal,
    onPcm: () => undefined,
    onStatus: () => undefined,
  });
  await next.close();
});

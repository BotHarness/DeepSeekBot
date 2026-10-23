import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalVideoClient, type LocalVideoTransport } from '../src/local-video-client.js';
import {
  LOCAL_VIDEO_PATH,
  type LocalVideoBinding,
  type LocalVideoState,
} from '../src/local-video-contract.js';
import { createLocalVideoOwner } from '../src/local-video-owner.js';
import { localVideoCommand } from '../src/local-video-http.js';
import { createRemoteKeyboardInput } from '../../../apps/mobile/src/host/remote-keyboard-input.js';
import type { DesktopInput } from '../src/desktop-view.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ownerFixture() {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const caller = { deviceId: 'same-admitted-device' };
  let paused = false;
  const peer = {
    offer: { type: 'offer' as const, sdp: 'v=0\r\n' },
    display: { width: 1280, height: 720 },
    answer: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const effects = vi.fn(async () => ({ content: [] }));
  const owner = createLocalVideoOwner({
    pause: {
      read: () => paused,
      write: (value) => {
        paused = value;
      },
    },
    isRunning: () => true,
    driver: {
      call: async (tool, args) =>
        tool === 'get_screen_size'
          ? { structuredContent: peer.display }
          : tool === 'set_agent_cursor_enabled'
            ? { content: [] }
            : tool === 'get_agent_cursor_state'
              ? { structuredContent: { session: args['session'], enabled: false } }
              : effects(),
    },
    media: {
      open: async ({ onStatus }) => {
        onStatus({ status: 'live', captureAlive: true, ...peer.display });
        return peer;
      },
    },
  });
  const calls: Record<string, unknown>[] = [];
  const transport: LocalVideoTransport = {
    async api(_path, { body, signal }) {
      calls.push(body);
      const result = await localVideoCommand(owner, caller, body, signal);
      return { status: result.ok ? 200 : 409, body: result };
    },
  };
  const first = createLocalVideoClient(transport);
  const acquire = async () => {
    await first.start();
    const binding = first.getState().host!.binding!;
    await first.answer(binding.attemptId, 'v=0\r\n');
    first.playback(binding.attemptId, 1, 0);
    await vi.advanceTimersByTimeAsync(2_000);
    await first.takeover();
    expect(first.getState().status).toBe('controlling');
    return binding;
  };
  return { owner, caller, peer, effects, calls, transport, first, acquire };
}

const click = { kind: 'click', x: 40, y: 50, count: 1, button: 'left' } as const;

function fixture() {
  vi.useFakeTimers();
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  let opens = 0;
  let binding: LocalVideoBinding = {
    computerId: 'local',
    runtimeId: 'runtime-1',
    viewerId: 'viewer-1',
    attemptId: 'attempt-1',
  };
  let host: LocalVideoState = {
    computerId: 'local',
    runtimeId: 'runtime-1',
    paused: false,
    controller: false,
    viewerCount: 0,
    controlHeld: false,
    lastInputSequence: 0,
    media: { status: 'live', captureAlive: true, width: 1280, height: 720 },
  };
  let onInput: (() => Promise<void>) | undefined;
  const transport: LocalVideoTransport = {
    async api(path, { body }) {
      calls.push({ path, body });
      switch (body['kind']) {
        case 'open':
          opens++;
          binding = { ...binding, attemptId: `attempt-${opens}` };
          host = {
            ...host,
            binding,
            viewerCount: 1,
            media: { ...host.media, status: 'live' },
            offer: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
          };
          break;
        case 'takeover':
          host = {
            ...host,
            paused: true,
            controller: true,
            controlHeld: true,
            grant: { generation: 1, expiresAt: 30000 },
          };
          break;
        case 'input':
          await onInput?.();
          host = { ...host, lastInputSequence: host.lastInputSequence + 1 };
          break;
        case 'resume':
        case 'release':
        case 'close': {
          const { grant: _grant, ...rest } = host;
          host = {
            ...rest,
            paused: body['kind'] === 'resume' ? false : host.paused,
            controller: false,
            controlHeld: false,
          };
          break;
        }
      }

      const { offer: _offer, ...snapshot } = host;
      return { status: 200, body: { ok: true, state: body['kind'] === 'open' ? host : snapshot } };
    },
  };
  const client = createLocalVideoClient(transport);
  return {
    client,
    calls,
    transport,
    setInput: (fn: () => Promise<void>) => {
      onInput = fn;
    },
    stall: () => {
      host = { ...host, controller: false, media: { ...host.media, status: 'stalled' } };
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('Local Computer video consumer', () => {
  it('delivers native multiline paste and deletion bursts through the bounded client queue', async () => {
    const h = ownerFixture();
    const keyboard = createRemoteKeyboardInput();
    const failed = vi.fn();
    try {
      await h.acquire();
      const inputs: DesktopInput[] = [];
      for (const line of ['a', 'b', 'c', 'd']) {
        if (inputs.length) inputs.push({ kind: 'key', key: 'return', modifiers: [] });
        inputs.push({ kind: 'type', text: line });
      }
      for (let i = 0; i < 64; i++) inputs.push({ kind: 'key', key: 'backspace', modifiers: [] });
      inputs.forEach((input) => keyboard.enqueue(input, (input) => h.first.input(input), failed));
      await vi.advanceTimersByTimeAsync(0);
      expect(
        h.calls.filter((call) => call['kind'] === 'input').map((call) => call['input']),
      ).toEqual(inputs);
      expect(h.effects).toHaveBeenCalledTimes(inputs.length);
      expect(failed).not.toHaveBeenCalled();
      expect(h.first.getState().status).toBe('controlling');
    } finally {
      keyboard.stop();
      await h.first.stop();
      await h.owner.dispose();
    }
  });

  it('hands control and Bot use back in one explicit action while keeping the preview open', async () => {
    const h = ownerFixture();
    try {
      const binding = await h.acquire();
      await h.first.input({ kind: 'scroll', direction: 'right', amount: 2, x: 40, y: 50 });
      await h.first.input({ kind: 'scroll', direction: 'down', amount: 3, x: 40, y: 50 });
      expect(h.effects).toHaveBeenCalledTimes(2);
      const before = h.calls.length;
      await h.first.resume();
      expect(h.calls.slice(before).map((command) => command['kind'])).toEqual(['resume']);
      expect(h.first.getState()).toMatchObject({
        status: 'observing',
        host: { binding, paused: false, controller: false },
      });
      expect(h.first.getState().host?.grant).toBeUndefined();
      expect(h.peer.close).not.toHaveBeenCalled();
      await expect(h.owner.runBotOperation(async () => 'Bot can operate')).resolves.toBe(
        'Bot can operate',
      );
      await h.first.input(click);
      expect(h.effects).toHaveBeenCalledTimes(2);
    } finally {
      await h.first.stop();
      await h.owner.dispose();
    }
  });

  it.each(['viewer-limit', 'native-unavailable', 'stop-after-status', 'open-failed'] as const)(
    'keeps the first same-device viewer and grant intact when a second client ends at %s',
    async (mode) => {
      const h = ownerFixture();
      const secondCalls: Record<string, unknown>[] = [];
      const second = createLocalVideoClient(
        {
          api: async (path, init) => {
            secondCalls.push(init.body);
            if (mode === 'open-failed' && init.body['kind'] === 'open')
              throw new Error('transport failed');
            return h.transport.api(path, init);
          },
        },
        { mediaAvailable: mode !== 'native-unavailable' },
      );
      const unsubscribe = second.subscribe(() => {
        if (
          mode === 'stop-after-status' &&
          second.getState().status === 'opening' &&
          second.getState().host
        )
          void second.stop();
      });
      try {
        const binding = await h.acquire();
        const grant = h.first.getState().host!.grant;
        await second.start();
        if (mode === 'viewer-limit') expect(second.getState().code).toBe('viewer-limit');
        if (mode === 'native-unavailable')
          expect(second.getState().code).toBe('native-module-unavailable');
        expect(second.getState().host).toMatchObject({
          runtimeId: binding.runtimeId,
          paused: true,
          controller: false,
        });
        expect(second.getState().host?.binding).toBeUndefined();
        expect(second.getState().host?.offer).toBeUndefined();
        expect(second.getState().host?.grant).toBeUndefined();
        second.playback(binding.attemptId, 99, 0);
        await second.answer(binding.attemptId, 'foreign-answer');
        await second.takeover();
        await second.release();
        await second.input(click);
        second.mediaFailed(binding.attemptId, 'foreign-native-callback');
        await second.stop();
        expect(secondCalls.map((command) => command['kind'])).toEqual(
          mode === 'native-unavailable' || mode === 'stop-after-status'
            ? ['status']
            : ['status', 'open'],
        );
        expect(h.peer.close).not.toHaveBeenCalled();
        expect(await h.owner.handle(h.caller, { kind: 'status' })).toMatchObject({
          binding,
          grant,
          controller: true,
          paused: true,
        });
        h.first.playback(binding.attemptId, 2, 0);
        await vi.advanceTimersByTimeAsync(2_000);
        await h.first.input(click);
        expect(h.effects).toHaveBeenCalledOnce();
        expect(h.first.getState().host?.grant?.generation).toBe(grant?.generation);
      } finally {
        unsubscribe();
        await second.stop();
        await h.first.stop();
        await h.owner.dispose();
      }
    },
  );

  it('allows explicit runtime-only resume without adopting or closing another same-device attempt', async () => {
    const h = ownerFixture();
    const commands: Record<string, unknown>[] = [];
    const second = createLocalVideoClient(
      {
        api: async (path, init) => {
          commands.push(init.body);
          return h.transport.api(path, init);
        },
      },
      { mediaAvailable: false },
    );
    try {
      const binding = await h.acquire();
      await second.start();
      await second.resume();
      expect(second.getState().host).toMatchObject({
        runtimeId: binding.runtimeId,
        paused: false,
        controller: false,
      });
      expect(second.getState().host?.binding).toBeUndefined();
      expect(second.getState().host?.offer).toBeUndefined();
      expect(second.getState().host?.grant).toBeUndefined();
      await second.release();
      await second.answer(binding.attemptId, 'not-owned');
      await second.stop();
      expect(commands).toEqual([
        { kind: 'status' },
        { kind: 'resume', runtimeId: binding.runtimeId },
      ]);
      expect(h.peer.close).not.toHaveBeenCalled();
      const observed = await h.owner.handle(h.caller, { kind: 'status' });
      expect(observed).toMatchObject({ binding, viewerCount: 1, paused: false, controller: false });
      expect(observed.grant).toBeUndefined();
      await expect(h.owner.runBotOperation(async () => 'resumed explicitly')).resolves.toBe(
        'resumed explicitly',
      );
    } finally {
      await second.stop();
      await h.first.stop();
      await h.owner.dispose();
    }
  });

  it('still closes its own late successful open after cancellation before receiving the binding', async () => {
    const h = ownerFixture();
    const allocated = deferred();
    const deliver = deferred();
    const client = createLocalVideoClient({
      api: async (path, init) => {
        const response = await h.transport.api(path, init);
        if (init.body['kind'] === 'open') {
          allocated.resolve();
          await deliver.promise;
        }
        return response;
      },
    });
    try {
      const opening = client.start();
      await allocated.promise;
      const binding = (await h.owner.handle(h.caller, { kind: 'status' })).binding;
      expect(binding).toBeDefined();
      await client.stop();
      expect(h.peer.close).not.toHaveBeenCalled();
      deliver.resolve();
      await opening;
      expect(h.calls.filter((command) => command['kind'] === 'close')).toEqual([
        { kind: 'close', binding },
      ]);
      expect(h.peer.close).toHaveBeenCalledOnce();
      expect(await h.owner.handle(h.caller, { kind: 'status' })).toMatchObject({
        viewerCount: 0,
        paused: false,
      });
      expect(client.getState()).toMatchObject({ status: 'idle', presenting: false });
      expect(client.getState().host?.binding).toBeUndefined();
    } finally {
      deliver.resolve();
      await client.stop();
      await h.owner.dispose();
    }
  });

  it('retains ownership across a stalled heartbeat and releases it without resuming Bots', async () => {
    const { client, calls, stall } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    stall();
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.getState()).toMatchObject({
      status: 'observing',
      host: {
        controller: false,
        paused: true,
        grant: { generation: 1 },
        media: { status: 'stalled' },
      },
    });
    await client.input(click);
    expect(calls.some(({ body }) => body['kind'] === 'input')).toBe(false);
    await client.release();
    expect(calls.at(-1)?.body['kind']).toBe('release');
    expect(client.getState().host?.paused).toBe(true);
    expect(client.getState().host?.grant).toBeUndefined();
    await client.stop();
  });

  it.each([false, true])(
    'closes a stalled attempt before reconnect and respects intervening stop (%s)',
    async (stopDuringClose) => {
      const { client, calls, transport, stall } = fixture();
      const send = transport.api;
      const closing = deferred();
      transport.api = async (path, init) => {
        if (init.body['kind'] === 'close') await closing.promise;
        return send(path, init);
      };
      await client.start();
      client.playback('attempt-1', 1, 0);
      await client.takeover();
      stall();
      await vi.advanceTimersByTimeAsync(2000);
      const reconnecting = client.reconnect();
      expect(client.getState()).toMatchObject({ status: 'idle', busy: true, presenting: false });
      expect(client.getState().host?.binding).toBeUndefined();
      expect(calls.filter(({ body }) => body['kind'] === 'open')).toHaveLength(1);
      const stopping = stopDuringClose ? client.stop() : Promise.resolve();
      closing.resolve();
      await Promise.all([reconnecting, stopping]);
      if (stopDuringClose) {
        expect(client.getState().status).toBe('idle');
        expect(calls.filter(({ body }) => body['kind'] === 'open')).toHaveLength(1);
      } else {
        expect(calls.slice(-3).map(({ body }) => body['kind'])).toEqual([
          'close',
          'status',
          'open',
        ]);
        expect(client.getState()).toMatchObject({
          status: 'observing',
          host: { paused: true, binding: { attemptId: 'attempt-2' } },
        });
        expect(client.getState().host?.grant).toBeUndefined();
        client.playback('attempt-1', 999, 0);
        client.playback('attempt-2', 1, 0);
        await client.input(click);
        expect(calls.filter(({ body }) => body['kind'] === 'takeover')).toHaveLength(1);
        expect(calls.some(({ body }) => body['kind'] === 'input')).toBe(false);
      }
      await client.stop();
    },
  );

  it('keeps the attempt offer mounted after signaling, heartbeat and control snapshots', async () => {
    const { client } = fixture();
    await client.start();
    const offer = client.getState().host?.offer;
    expect(offer?.type).toBe('offer');
    await client.answer('attempt-1', 'v=0\r\n');
    expect(client.getState().host?.offer).toBe(offer);
    client.playback('attempt-1', 1, 0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.getState().host?.offer).toBe(offer);
    await client.takeover();
    await client.release();
    expect(client.getState().host?.offer).toBe(offer);
    await client.stop();
    expect(client.getState().host).toMatchObject({
      runtimeId: 'runtime-1',
      paused: true,
      controller: false,
    });
    expect(client.getState().host?.offer).toBeUndefined();
    expect(client.getState().host?.binding).toBeUndefined();
    expect(client.getState().host?.grant).toBeUndefined();
    await client.start();
    expect(client.getState().host?.binding?.attemptId).toBe('attempt-2');
    expect(client.getState().host?.offer).not.toBe(offer);
    await client.stop();
  });

  it('observes without taking control and sends no image request on unavailable video', async () => {
    const { client, calls } = fixture();
    await client.start();
    client.playback('attempt-1', 15, 0);
    await client.input(click);
    expect(calls.map(({ body }) => body['kind'])).toEqual(['status', 'open']);
    expect(client.getState().host?.paused).toBe(false);
    client.mediaFailed('attempt-1', 'ice-disconnected');
    await client.stop();
    expect(calls.every(({ path }) => path === LOCAL_VIDEO_PATH)).toBe(true);
    expect(calls.some(({ body }) => body['kind'] === 'input' || body['kind'] === 'takeover')).toBe(
      false,
    );
  });

  it('ignores an old signaling response after replacing the receiver attempt', async () => {
    const { client, transport } = fixture();
    const send = transport.api;
    const delayed = deferred();
    const entered = deferred();
    transport.api = async (path, init) => {
      const response = await send(path, init);
      if (init.body['kind'] === 'signal') {
        entered.resolve();
        await delayed.promise;
      }
      return response;
    };
    await client.start();
    const answering = client.answer('attempt-1', 'v=0\r\n');
    await entered.promise;
    await client.stop();
    await client.start();
    const replacement = client.getState().host;
    delayed.resolve();
    await answering;
    client.playback('attempt-1', 100, 0);
    client.mediaFailed('attempt-1', 'late-native-close');
    expect(client.getState().host).toBe(replacement);
    expect(client.getState()).toMatchObject({
      status: 'observing',
      presenting: false,
      host: { binding: { attemptId: 'attempt-2' } },
    });
    await client.stop();
  });

  it('requires explicit takeover, release retains pause, and resume is separate', async () => {
    const { client, calls } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    expect(await client.input(click)).toBe(true);
    expect(calls.find(({ body }) => body['kind'] === 'input')?.body).toMatchObject({
      generation: 1,
      sequence: 1,
      input: click,
    });
    await client.release();
    expect(client.getState()).toMatchObject({ status: 'observing', host: { paused: true } });
    expect(await client.input(click)).toBe(false);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    await client.resume();
    expect(client.getState().host?.paused).toBe(false);
    await client.stop();
  });

  it('discards queued input when release begins and never restores control from an old response', async () => {
    const { client, calls, setInput } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    const pending = deferred();
    setInput(() => pending.promise);
    const first = client.input(click);
    await Promise.resolve();
    const queued = client.input(click);
    const release = client.release();
    pending.resolve();
    const [firstReceipt, queuedReceipt] = await Promise.all([first, queued, release]);
    expect(firstReceipt).toBe(false);
    expect(queuedReceipt).toBe(false);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    expect(client.getState().status).toBe('observing');
    await client.stop();
  });

  it('does not replay an action after its acknowledgement is lost', async () => {
    const { client, calls, setInput } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    setInput(() => Promise.reject(new Error('ack lost after execution')));
    expect(await client.input({ kind: 'type', text: '中文 abc' })).toBe(false);
    expect(client.getState()).toMatchObject({
      status: 'unavailable',
      code: 'input-result-unknown',
    });
    await client.start();
    client.playback('attempt-2', 1, 0);
    await client.input(click);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    expect(calls.filter(({ body }) => body['kind'] === 'takeover')).toHaveLength(1);
    await client.stop();
  });

  it('expires presentation independently of healthy heartbeats and accepts continuously presented static content', async () => {
    const { client, calls } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    for (let frames = 2; frames <= 8; frames++) {
      await vi.advanceTimersByTimeAsync(1000);
      client.playback('attempt-1', frames, 0);
    }
    await client.input(click);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.getState().presenting).toBe(false);
    await client.input(click);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    await client.release();
    await client.stop();
  });

  it('fences late native callbacks after a new attempt and resumes pause without media', async () => {
    const { client, calls } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    await client.stop();
    await client.resume();
    expect(calls.find(({ body }) => body['kind'] === 'resume')?.body).toEqual({
      kind: 'resume',
      runtimeId: 'runtime-1',
    });
    await client.start();
    await client.answer('attempt-1', 'v=0\r\n');
    client.playback('attempt-1', 9999, 0);
    client.mediaFailed('attempt-1', 'stale-close');
    expect(client.getState()).toMatchObject({ status: 'observing', presenting: false });
    expect(calls.some(({ body }) => body['kind'] === 'signal')).toBe(false);
    await client.stop();
  });

  it('keeps release usable when the bounded input queue is full', async () => {
    const { client, calls, setInput } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    const blocked = deferred();
    setInput(() => blocked.promise);
    const inputs = Array.from({ length: 20 }, () => client.input(click));
    await Promise.resolve();
    await client.release();
    expect(calls.some(({ body }) => body['kind'] === 'release')).toBe(true);
    expect(client.getState()).toMatchObject({ status: 'observing', host: { paused: true } });
    blocked.resolve();
    await Promise.all(inputs);
    expect(calls.filter(({ body }) => body['kind'] === 'input')).toHaveLength(1);
    await client.stop();
  });

  it('checks platform capability but never opens media without the native module', async () => {
    const { transport, calls } = fixture();
    const client = createLocalVideoClient(transport, { mediaAvailable: false });
    await client.start();
    expect(client.getState()).toMatchObject({
      status: 'unavailable',
      code: 'native-module-unavailable',
    });
    expect(calls.map(({ body }) => body['kind'])).toEqual(['status']);
    await client.stop();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalVideoClient, type LocalVideoTransport } from '../src/local-video-client.js';
import { LOCAL_VIDEO_PATH, type LocalVideoBinding, type LocalVideoState } from '../src/local-video-contract.js';

const click = { kind: 'click', x: 40, y: 50, count: 1, button: 'left' } as const;

function fixture() {
  vi.useFakeTimers();
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  let opens = 0;
  let binding: LocalVideoBinding = { computerId: 'local', runtimeId: 'runtime-1', viewerId: 'viewer-1', attemptId: 'attempt-1' };
  let host: LocalVideoState = {
    computerId: 'local', runtimeId: 'runtime-1', paused: false, controller: false,
    viewerCount: 0, controlHeld: false,
    lastInputSequence: 0, media: { status: 'live', captureAlive: true, width: 1280, height: 720 },
  };
  let onInput: (() => Promise<void>) | undefined;
  const transport: LocalVideoTransport = {
    async api(path, { body }) {
      calls.push({ path, body });
      switch (body['kind']) {
        case 'open':
          opens++;
          binding = { ...binding, attemptId: `attempt-${opens}` };
          host = { ...host, binding, viewerCount: 1, media: { ...host.media, status: 'live' }, offer: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' } };
          break;
        case 'takeover':
          host = { ...host, paused: true, controller: true, controlHeld: true, grant: { generation: 1, expiresAt: 30000 } };
          break;
        case 'input':
          await onInput?.();
          host = { ...host, lastInputSequence: host.lastInputSequence + 1 };
          break;
        case 'resume': case 'release': case 'close': {
          const { grant: _grant, ...rest } = host;
          host = { ...rest, paused: body['kind'] === 'resume' ? false : host.paused, controller: false, controlHeld: false };
          break;
        }
      }
      // The owner discloses SDP only on open, never on status/heartbeat/control snapshots.
      const { offer: _offer, ...snapshot } = host;
      return { status: 200, body: { ok: true, state: body['kind'] === 'open' ? host : snapshot } };
    },
  };
  const client = createLocalVideoClient(transport);
  return {
    client, calls, transport,
    setInput: (fn: () => Promise<void>) => { onInput = fn; },
    stall: () => { host = { ...host, controller: false, media: { ...host.media, status: 'stalled' } }; },
  };
}

afterEach(() => vi.useRealTimers());

describe('Local Computer video consumer', () => {
  it('retains ownership across a stalled heartbeat and releases it without resuming Bots', async () => {
    const { client, calls, stall } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    stall();
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.getState()).toMatchObject({ status: 'observing', host: {
      controller: false, paused: true, grant: { generation: 1 }, media: { status: 'stalled' },
    } });
    await client.input(click);
    expect(calls.some(({ body }) => body['kind'] === 'input')).toBe(false);
    await client.release();
    expect(calls.at(-1)?.body['kind']).toBe('release');
    expect(client.getState().host?.paused).toBe(true);
    expect(client.getState().host?.grant).toBeUndefined();
    await client.stop();
  });

  it.each([false, true])('closes a stalled attempt before reconnect and respects intervening stop (%s)', async (stopDuringClose) => {
    const { client, calls, transport, stall } = fixture();
    const send = transport.api;
    const closing = Promise.withResolvers<void>();
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
      expect(calls.slice(-3).map(({ body }) => body['kind'])).toEqual(['close', 'status', 'open']);
      expect(client.getState()).toMatchObject({ status: 'observing', host: { paused: true, binding: { attemptId: 'attempt-2' } } });
      expect(client.getState().host?.grant).toBeUndefined();
      client.playback('attempt-1', 999, 0);
      client.playback('attempt-2', 1, 0);
      await client.input(click);
      expect(calls.filter(({ body }) => body['kind'] === 'takeover')).toHaveLength(1);
      expect(calls.some(({ body }) => body['kind'] === 'input')).toBe(false);
    }
    await client.stop();
  });

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
    expect(client.getState().host).toMatchObject({ runtimeId: 'runtime-1', paused: true, controller: false });
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
    expect(calls.some(({ body }) => body['kind'] === 'input' || body['kind'] === 'takeover')).toBe(false);
  });

  it('ignores an old signaling response after replacing the receiver attempt', async () => {
    const { client, transport } = fixture();
    const send = transport.api;
    const delayed = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
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
      status: 'observing', presenting: false, host: { binding: { attemptId: 'attempt-2' } },
    });
    await client.stop();
  });

  it('requires explicit takeover, release retains pause, and resume is separate', async () => {
    const { client, calls } = fixture();
    await client.start();
    client.playback('attempt-1', 1, 0);
    await client.takeover();
    await client.input(click);
    expect(calls.find(({ body }) => body['kind'] === 'input')?.body).toMatchObject({ generation: 1, sequence: 1, input: click });
    await client.release();
    expect(client.getState()).toMatchObject({ status: 'observing', host: { paused: true } });
    await client.input(click);
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
    const pending = Promise.withResolvers<void>();
    setInput(() => pending.promise);
    const first = client.input(click);
    await Promise.resolve();
    const queued = client.input(click);
    const release = client.release();
    pending.resolve();
    await Promise.all([first, queued, release]);
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
    await client.input(click);
    expect(client.getState()).toMatchObject({ status: 'unavailable', code: 'input-result-unknown' });
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
      client.playback('attempt-1', frames, 0); // Unchanged pixels, new video presentation.
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
    expect(calls.find(({ body }) => body['kind'] === 'resume')?.body).toEqual({ kind: 'resume', runtimeId: 'runtime-1' });
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
    const blocked = Promise.withResolvers<void>();
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
    expect(client.getState()).toMatchObject({ status: 'unavailable', code: 'native-module-unavailable' });
    expect(calls.map(({ body }) => body['kind'])).toEqual(['status']);
    await client.stop();
  });
});

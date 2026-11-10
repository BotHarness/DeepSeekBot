import { afterEach, expect, it, vi } from 'vitest';
import { createVoiceCalls, type VoiceCallMedia, type VoiceCallsDeps } from '../src/voice/calls.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  vi.useRealTimers();
});

function owner(media: VoiceCallMedia) {
  const providers: VoiceCallsDeps['providers'] = {
    has: () => true,
    transcribe: async () => ({ text: '', latencyMs: 0 }),
    synthesize: async () => ({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
  };
  const calls = createVoiceCalls({
    bot: () => ({ slug: 'qa', asr: { providerId: 'asr' }, voice: { providerId: 'tts' } }),
    providers,
    media: () => media,
    busy: () => false,
    send: async () => undefined,
    now: () => Date.now(),
  });
  cleanups.push(() => calls.dispose());
  return calls;
}

function peer(onStatus: (status: 'connected' | 'failed' | 'closed') => void) {
  return {
    offer: { type: 'offer' as const, sdp: 'v=0\r\n' },
    answer: async () => {
      onStatus('connected');
    },
    play: async () => undefined,
    close: async () => undefined,
  };
}

it('allows a delayed offer and the following answer within the 20 second connect budget', async () => {
  vi.useFakeTimers();
  const calls = owner({
    availability: async () => 'ready',
    async open({ onStatus }) {
      await new Promise<void>((resolve) => setTimeout(resolve, 11_000));
      return peer(onStatus);
    },
  });
  const opened = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
  await vi.advanceTimersByTimeAsync(11_000);
  const result = await opened;
  expect(result.ok).toBe(true);
  if (!result.ok || !result.call) throw new Error('open refused');
  await vi.advanceTimersByTimeAsync(1_100);
  const status = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(status.ok && status.calls?.[0]?.phase).toBe('connecting');
  const signal = await calls.handle(
    { deviceId: 'qa-phone' },
    { kind: 'signal', callId: result.call.callId, answer: { type: 'answer', sdp: 'v=0\r\n' } },
  );
  expect(signal.ok && signal.call?.phase).toBe('listening');
  await vi.advanceTimersByTimeAsync(7_000);
  const healthy = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(healthy.ok && healthy.calls?.[0]?.phase).toBe('listening');
  await vi.advanceTimersByTimeAsync(2_000);
  const expired = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(expired.ok && expired.calls?.[0]).toMatchObject({
    phase: 'ended',
    endReason: 'connection-lost',
  });
});

it('counts availability and offer time together and closes a peer returned after expiry', async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => undefined);
  let mediaSignal: AbortSignal | undefined;
  const calls = owner({
    availability: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
      return 'ready';
    },
    async open({ signal, onStatus }) {
      mediaSignal = signal;
      await new Promise<void>((resolve) => setTimeout(resolve, 16_000));
      return { ...peer(onStatus), close };
    },
  });
  await calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa', media: 'synthetic' });
  const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
  await vi.advanceTimersByTimeAsync(19_999);
  expect(mediaSignal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(mediaSignal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await pending).ok).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
  const status = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(status.ok && status.calls?.filter((call) => call.media === 'webrtc')).toEqual([]);
});

it('does not allocate media when availability exhausts the connection budget', async () => {
  vi.useFakeTimers();
  const open = vi.fn<VoiceCallMedia['open']>(async ({ onStatus }) => peer(onStatus));
  const calls = owner({
    availability: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 21_000));
      return 'ready';
    },
    open,
  });
  await calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa', media: 'synthetic' });
  const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
  await vi.advanceTimersByTimeAsync(21_000);
  expect((await pending).ok).toBe(false);
  expect(open).not.toHaveBeenCalled();
});

it('keeps the original connection deadline while waiting for the answer', async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => undefined);
  const calls = owner({
    availability: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
      return 'ready';
    },
    async open({ onStatus }) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      return { ...peer(onStatus), close };
    },
  });
  await calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa', media: 'synthetic' });
  const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
  await vi.advanceTimersByTimeAsync(6_000);
  expect((await pending).ok).toBe(true);
  await vi.advanceTimersByTimeAsync(13_999);
  const before = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(before.ok && before.calls?.find((call) => call.media === 'webrtc')?.phase).toBe(
    'connecting',
  );
  await vi.advanceTimersByTimeAsync(1);
  const after = await calls.handle({ deviceId: 'qa-phone' }, { kind: 'status' });
  expect(after.ok && after.calls?.find((call) => call.media === 'webrtc')).toMatchObject({
    phase: 'ended',
    endReason: 'connect-timeout',
  });
  expect(close).toHaveBeenCalledTimes(1);
});

it('closes a late media result after the caller cancels opening', async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => undefined);
  const abort = new AbortController();
  const calls = owner({
    availability: async () => 'ready',
    async open({ onStatus }) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      return { ...peer(onStatus), close };
    },
  });
  const pending = calls.handle(
    { deviceId: 'qa-phone' },
    { kind: 'open', slug: 'qa' },
    abort.signal,
  );
  await vi.advanceTimersByTimeAsync(100);
  abort.abort();
  await vi.advanceTimersByTimeAsync(900);
  expect((await pending).ok).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not create media after cancellation while availability is pending', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const open = vi.fn<VoiceCallMedia['open']>(async ({ onStatus }) => {
    return peer(onStatus);
  });
  const calls = owner({
    availability: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      return 'ready';
    },
    open,
  });
  await calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa', media: 'synthetic' });
  const pending = calls.handle(
    { deviceId: 'qa-phone' },
    { kind: 'open', slug: 'qa' },
    abort.signal,
  );
  await vi.advanceTimersByTimeAsync(100);
  abort.abort();
  await vi.advanceTimersByTimeAsync(900);
  const result = await pending;
  expect(open).not.toHaveBeenCalled();
  expect(result.ok).toBe(false);
});

it.each(['revoke', 'dispose'] as const)(
  'closes a late peer after %s while open was pending',
  async (action) => {
    vi.useFakeTimers();
    const close = vi.fn(async () => undefined);
    const calls = owner({
      availability: async () => 'ready',
      async open({ onStatus }) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
        return { ...peer(onStatus), close };
      },
    });
    const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
    await vi.advanceTimersByTimeAsync(100);
    if (action === 'revoke') await calls.revoke('qa-phone');
    else await calls.dispose();
    await vi.advanceTimersByTimeAsync(1_900);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  },
);

it('settles the opening operation at 20 seconds even if availability is still pending', async () => {
  vi.useFakeTimers();
  const calls = owner({
    availability: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
      return 'ready';
    },
    open: async ({ onStatus }) => peer(onStatus),
  });
  await calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa', media: 'synthetic' });
  let settled = false;
  const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' }).then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(20_001);
  const bounded = settled;
  await vi.advanceTimersByTimeAsync(10_000);
  await pending;
  expect(bounded).toBe(true);
});

it('closes a late peer after media reports failed before resolving open', async () => {
  vi.useFakeTimers();
  const close = vi.fn(async () => undefined);
  const calls = owner({
    availability: async () => 'ready',
    async open({ onStatus }) {
      setTimeout(() => onStatus('failed'), 100);
      await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
      return { ...peer(onStatus), close };
    },
  });
  const pending = calls.handle({ deviceId: 'qa-phone' }, { kind: 'open', slug: 'qa' });
  await vi.advanceTimersByTimeAsync(2_000);
  expect((await pending).ok).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
});

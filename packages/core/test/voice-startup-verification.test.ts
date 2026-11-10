import { afterEach, expect, it, vi } from 'vitest';
import { createVoiceCalls, type VoiceCallMedia } from '../src/voice/calls.js';
import { VoiceCallMediaError } from '../src/voice/call-contract.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function setup() {
  let available: 'ready' | 'helper-missing' = 'ready';
  const close = vi.fn(async () => undefined);
  const availability = vi.fn(async () => available);
  const open = vi.fn<VoiceCallMedia['open']>(async () => ({
    offer: { type: 'offer', sdp: 'v=0\r\n' },
    answer: async () => undefined,
    play: async () => undefined,
    close,
  }));
  const calls = createVoiceCalls({
    bot: () => ({ slug: 'qa', asr: { providerId: 'asr' }, voice: { providerId: 'tts' } }),
    providers: {
      has: () => true,
      transcribe: async () => ({ text: '', latencyMs: 0 }),
      synthesize: async () => ({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
    },
    media: () => ({ availability, open }),
    busy: () => false,
    send: async () => undefined,
  });
  closers.push(() => calls.dispose());
  return {
    calls,
    availability,
    open,
    close,
    missing: () => {
      available = 'helper-missing';
    },
    start: () => calls.handle({ deviceId: 'phone' }, { kind: 'open', slug: 'qa' }),
  };
}

it('delegates fresh startup verification to media open without a duplicate readiness pass', async () => {
  const h = setup();
  expect((await h.start()).ok).toBe(true);
  expect(h.availability).not.toHaveBeenCalled();
  expect(h.open).toHaveBeenCalledTimes(1);
});

it('preserves availability validation before replacing an existing call', async () => {
  const h = setup();
  const first = await h.start();
  h.missing();
  expect(await h.start()).toMatchObject({ ok: false, code: 'media-helper-missing' });
  expect(h.availability).toHaveBeenCalledTimes(1);
  expect(h.open).toHaveBeenCalledTimes(1);
  expect(h.close).not.toHaveBeenCalled();
  const status = await h.calls.handle({ deviceId: 'phone' }, { kind: 'status' });
  expect(status.ok && status.calls?.[0]?.callId).toBe(first.ok && first.call?.callId);
});

it('retains replacement preflight and performs fresh verification in the next media open', async () => {
  const h = setup();
  expect((await h.start()).ok).toBe(true);
  expect((await h.start()).ok).toBe(true);
  expect(h.availability).toHaveBeenCalledTimes(1);
  expect(h.open).toHaveBeenCalledTimes(2);
  expect(h.close).toHaveBeenCalledTimes(1);
});

it.each(['helper-missing', 'unsupported-platform'] as const)(
  'preserves fresh startup %s refusal',
  async (code) => {
    const h = setup();
    h.open.mockRejectedValue(new VoiceCallMediaError(code, 'Unavailable media'));
    expect(await h.start()).toMatchObject({
      ok: false,
      code: code === 'helper-missing' ? 'media-helper-missing' : 'media-unsupported',
    });
    expect(h.availability).not.toHaveBeenCalled();
  },
);

it('keeps readiness authoritative even when fresh startup omits the duplicate check', async () => {
  const h = setup();
  h.missing();
  const result = await h.calls.handle({ deviceId: 'phone' }, { kind: 'readiness', slug: 'qa' });
  expect(result.ok && result.readiness?.missing).toContain('media-helper-missing');
  expect(h.availability).toHaveBeenCalledTimes(1);
  expect(h.open).not.toHaveBeenCalled();
});

it('preserves media refusal across separately loaded contract module identities', async () => {
  vi.resetModules();
  const other = await import('../src/voice/call-contract.js');
  expect(other.VoiceCallMediaError).not.toBe(VoiceCallMediaError);
  const h = setup();
  h.open.mockRejectedValue(new other.VoiceCallMediaError('helper-missing', 'Unavailable media'));
  expect(await h.start()).toMatchObject({ ok: false, code: 'media-helper-missing' });
});

it('does not map an unbranded external error to a trusted media refusal', async () => {
  const h = setup();
  h.open.mockRejectedValue(Object.assign(new Error('external'), { code: 'helper-missing' }));
  expect(await h.start()).toMatchObject({ ok: false, code: 'media-failed' });
});

it('exposes the connecting owner to another opening request before media resolves', async () => {
  const h = setup();
  const original = h.open.getMockImplementation()!;
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  h.open.mockImplementation(async (options) => {
    await gate;
    return original(options);
  });
  const first = h.start();
  const second = await h.calls.handle({ deviceId: 'other-phone' }, { kind: 'open', slug: 'qa' });
  expect(second).toMatchObject({ ok: false, code: 'call-active' });
  expect(h.availability).toHaveBeenCalledTimes(1);
  complete();
  expect((await first).ok).toBe(true);
  expect(h.open).toHaveBeenCalledTimes(1);
});

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach } from 'vitest';
import { type VoiceCallView } from '../src/voice/call-contract.js';
import { createVoiceCalls, type VoiceCallsDeps } from '../src/voice/calls.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

export async function jpeg(
  color: { r: number; g: number; b: number },
  width = 640,
  height = 360,
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

export function host(
  transcripts: string[] = ['这是什么', '现在呢', '还是这个吗'],
  sees?: boolean,
  options: { hold?: Promise<void>; failSend?: number; asr?: Promise<void> } = {},
) {
  let clock = 2_000_000;
  const order: string[] = [];
  let sends = 0;
  const sent: Parameters<VoiceCallsDeps['send']>[0][] = [];
  const records: Parameters<NonNullable<VoiceCallsDeps['recordFrames']>>[0][] = [];
  const lifecycle: Parameters<NonNullable<VoiceCallsDeps['record']>>[0]['record'][] = [];
  const calls = createVoiceCalls({
    async record({ record }) {
      lifecycle.push(record);
      return `lifecycle-${lifecycle.length}`;
    },
    async recordFrames(input) {
      await options.hold;
      records.push(input);
      order.push(`record:${input.frames}`);
      return `record-${records.length}`;
    },
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            asr: { providerId: 'asr-000000000001' },
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: () => true,
      transcribe: async () => {
        await options.asr;
        return { text: transcripts.shift() ?? '', latencyMs: 1 };
      },
      synthesize: async () => ({
        audio: new Uint8Array([0x49, 0x44, 0x33, 0]),
        mime: 'audio/mpeg',
      }),
    },
    media: () => undefined,
    async send(input) {
      sends += 1;
      if (sends === options.failSend) throw new Error('The DM refused the message.');
      sent.push(input);
      order.push(
        `sent:${input.visual === undefined ? 0 : 'image' in input.visual ? input.visual.frames : 'same'}`,
      );
    },
    busy: () => false,
    ...(sees === undefined ? {} : { seesImages: async () => sees }),
    now: () => clock,
  });
  cleanup.push(() => calls.dispose());
  const phone = { deviceId: 'phone-1' };
  const ok = async (command: Record<string, unknown>) => {
    const result = await calls.handle(phone, command);
    if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
    return result.call as VoiceCallView;
  };
  const say = async (callId: string, ms = 1200) => {
    const audio = concat(silence(200), speech(ms), silence(900));
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      clock += 1_000;
      await ok({
        kind: 'inject',
        callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
    }
    for (let index = 0; index < 60; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const frame = async (callId: string, source: 'camera' | 'screen' = 'camera', shade = 0) =>
    ok({
      kind: 'frame',
      callId,
      source,
      jpeg: (await jpeg({ r: shade % 256, g: 40, b: 90 }, 160, 90)).toString('base64'),
    });
  const talk = async (
    callId: string,
    during: (index: number) => Promise<void> = async () => undefined,
  ) => {
    const phrases = Array.from({ length: 5 }, (_, index) =>
      concat(speech(1_400, { seed: index + 3, f0: 140 + index * 9 }), silence(200)),
    );
    const audio = concat(silence(200), ...phrases, silence(900));
    let index = 0;
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      clock += 1_000;
      const view = await ok({
        kind: 'inject',
        callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
      if (view.phase === 'user-speaking') await during(index++);
    }
    return index;
  };
  const settle = async () => {
    for (let index = 0; index < 60; index += 1) await tick();
  };
  const type = async (channelId: string, options: { fails?: boolean; picture?: boolean } = {}) => {
    const messageId = `human-${randomUUID()}`;
    const harvested = await calls.text({
      channelId,
      messageId,
      ...(options.picture === undefined ? {} : { picture: options.picture }),
    });
    if (harvested !== undefined) {
      if (options.fails !== true)
        order.push(
          `text:${harvested.visual === undefined ? 0 : 'image' in harvested.visual ? harvested.visual.frames : 'same'}`,
        );
      harvested.settle(options.fails !== true);
    }
    return { messageId, harvested };
  };
  const dropped = async (callId: string) =>
    (await ok({ kind: 'heartbeat', callId })).events
      .filter((event) => event.type === 'frames-dropped')
      .reduce((sum, event) => sum + (event as { dropped: number }).dropped, 0);
  return {
    calls,
    sent,
    records,
    lifecycle,
    order,
    ok,
    say,
    talk,
    type,
    frame,
    settle,
    dropped,
    phone,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

export const imageFrames = (visual: unknown) =>
  typeof visual === 'object' && visual !== null && 'image' in visual
    ? (visual as unknown as { frames: number }).frames
    : 0;

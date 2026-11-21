import { afterEach, expect } from 'vitest';
import type {
  VoiceCallEvent,
  VoiceCallMediaStats,
  VoiceCallView,
} from '../src/voice/call-contract.js';
import { type ChannelVoiceCallRecord } from '../src/channels/voice-call-record.js';
import {
  createVoiceCalls,
  type CallSpeech,
  type VoiceCallBot,
  type VoiceCallMedia,
  type VoiceCallsDeps,
} from '../src/voice/calls.js';
import { type AudioClip } from '../src/voice/speech.js';
import { chunks } from './voice-audio-fixtures.js';

export const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

export function clipFor(text: string): Uint8Array {
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), Buffer.from(text)]),
  );
}

export function fakeMedia(
  availability: Awaited<ReturnType<VoiceCallMedia['availability']>> = 'ready',
) {
  const state = {
    onPcm: undefined as ((samples: Int16Array) => void) | undefined,
    onStatus: undefined as ((status: 'connected' | 'failed' | 'closed') => void) | undefined,
    answers: [] as string[],
    played: [] as { bytes: number; mime: string }[],
    audio: [] as Uint8Array[],
    stopped: 0,
    closed: 0,
    gains: [] as number[],
    failGain: undefined as number | undefined,
    playDelay: undefined as Promise<void> | undefined,
    stats: undefined as VoiceCallMediaStats | undefined,
  };
  const media: VoiceCallMedia = {
    availability: async () => availability,
    async open({ onPcm, onStatus }) {
      state.onPcm = onPcm;
      state.onStatus = onStatus;
      return {
        offer: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
        async answer(answer) {
          state.answers.push(answer.sdp);
          queueMicrotask(() => onStatus('connected'));
        },
        async play(audio, mime, signal) {
          state.played.push({ bytes: audio.byteLength, mime });
          state.audio.push(audio.slice());
          if (state.playDelay === undefined) return;
          await new Promise<void>((resolve) => {
            const stop = () => {
              state.stopped += 1;
              resolve();
            };
            if (signal.aborted) return stop();
            signal.addEventListener('abort', stop, { once: true });
            void state.playDelay!.then(() => {
              signal.removeEventListener('abort', stop);
              resolve();
            });
          });
        },
        async setGain(gain) {
          if (state.failGain === gain) {
            state.failGain = undefined;
            throw new Error('refused');
          }
          state.gains.push(gain);
        },
        async stats() {
          return state.stats;
        },
        async close() {
          state.closed += 1;
        },
      };
    },
  };
  return { media, state };
}

export function harness(
  options: {
    bot?: VoiceCallBot | undefined;
    providers?: VoiceCallsDeps['providers'];
    media?: VoiceCallMedia | undefined;
    busy?: () => boolean;
    send?: VoiceCallsDeps['send'];
    transcripts?: string[];
    bargeIn?: VoiceCallsDeps['bargeIn'];
    record?: VoiceCallsDeps['record'];
  } = {},
) {
  let clock = 1_000_000;
  const sent: {
    body: string;
    callId: string;
    channelId: string;
    messageId: string;
    speech?: { fromMs: number; toMs: number } | undefined;
  }[] = [];
  const log: string[] = [];
  const records: ChannelVoiceCallRecord[] = [];
  const bot: VoiceCallBot | undefined =
    'bot' in options
      ? options.bot
      : {
          slug: 'mira',
          asr: { providerId: 'asr-000000000001', language: 'zh' },
          voice: { providerId: 'tts-000000000001' },
        };
  const transcribed: Uint8Array[] = [];
  const transcripts = options.transcripts ?? ['帮我查一下明天的天气', '第二句话'];
  const synthesized: string[] = [];
  const providers: VoiceCallsDeps['providers'] = options.providers ?? {
    has: (id, kind) => id.startsWith(kind),
    async transcribe({ audio }) {
      transcribed.push(audio);
      return { text: transcripts.shift() ?? '', latencyMs: 5 };
    },
    async synthesize({ text }) {
      synthesized.push(text);
      return { audio: clipFor(text), mime: 'audio/mpeg' };
    },
  };
  const calls = createVoiceCalls({
    bot: (slug) => (slug === bot?.slug ? bot : undefined),
    providers,
    media: () => options.media,
    send:
      options.send ??
      (async (input) => {
        sent.push(input);
        log.push(`sent:${input.body}`);
      }),
    record:
      options.record ??
      (async ({ channelId, record }) => {
        expect(channelId).toBe('dm-mira');
        records.push(record);
        log.push(`record:${record.state}`);
        return `voice-call-${record.state}-${record.callId}`;
      }),
    busy: options.busy ?? (() => false),
    now: () => clock,
    ...(options.bargeIn === undefined ? {} : { bargeIn: options.bargeIn }),
  });
  cleanup.push(() => calls.dispose());
  const phone = { deviceId: 'phone-1' };
  const ok = async (command: Record<string, unknown>, caller = phone) => {
    const result = await calls.handle(caller, command);
    if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
    return result;
  };
  return {
    calls,
    sent,
    log,
    records,
    transcribed,
    synthesized,
    phone,
    ok,
    at: () => new Date(clock).toISOString(),
    advance: (ms: number) => {
      clock += ms;
    },
    feed(onPcm: (samples: Int16Array) => void, audio: Int16Array) {
      for (const chunk of chunks(audio)) {
        clock += 20;
        onPcm(chunk);
      }
    },
  };
}

export async function heard(
  speech: Promise<CallSpeech | undefined>,
): Promise<AudioClip | undefined> {
  const call = await speech;
  return call === undefined ? undefined : (await call.archive).clip;
}

export const types = (events: readonly VoiceCallEvent[]) => events.map((event) => event.type);

export async function settled() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

export async function connected(h: ReturnType<typeof harness>) {
  const opened = await h.ok({ kind: 'open', slug: 'mira' });
  const call = opened.call!;
  expect(call.phase).toBe('connecting');
  expect(call.offer?.sdp).toContain('m=audio');
  await h.ok({ kind: 'signal', callId: call.callId, answer: { type: 'answer', sdp: 'v=0\r\n' } });
  await settled();
  return call.callId;
}

export async function view(h: ReturnType<typeof harness>, callId: string, after = 0) {
  return (await h.ok({ kind: 'heartbeat', callId, after })).call as VoiceCallView;
}

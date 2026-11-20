import { VAD_SAMPLE_RATE } from './vad.js';
import { VoiceError, wavFromPcm16 } from './providers.js';
import type { AsrStream } from './soniox.js';
import { ended } from './calls-types.js';
import type { Call, VoiceCallsDeps, EventInput } from './calls-types.js';

const HEARING_EVENT_MS = 250;

export const SEGMENT_VAD = { segmentSilenceMs: 250, endSilenceMs: 600 } as const;

export const MIN_TAIL_SAMPLES = VAD_SAMPLE_RATE / 5;

const TIGHT =
  '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}\\u3000-\\u303F\\uFF00-\\uFFEF';

const TIGHT_END = new RegExp(`[${TIGHT}]$`, 'u');

const TIGHT_START = new RegExp(`^[${TIGHT}]`, 'u');

export function joinTranscripts(parts: readonly string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (part === '') continue;
    const tight = TIGHT_END.test(out) || TIGHT_START.test(part);
    out += out === '' || tight ? part : ` ${part}`;
  }
  return out;
}

const MAX_HEARING_CHARS = 500;

const FILLERS = new Set([
  '嗯',
  '嗯哼',
  '啊',
  '呃',
  '额',
  '哦',
  '噢',
  '喔',
  '唔',
  '哈',
  '嘿',
  '诶',
  '欸',
  '哎',
  '呀',
  '咳',
  '那个',
  'um',
  'umm',
  'uh',
  'uhh',
  'uh-huh',
  'er',
  'erm',
  'ah',
  'oh',
  'hmm',
  'hm',
  'mm',
  'mhm',
  'huh',
  'eh',
]);

const FILLER_CHARS = /^[嗯啊呃额哦噢喔唔哈嘿诶欸哎呀咳]+$/u;

export function contentWords(text: string, language?: string): number {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(language?.split(/[-_]/u)[0] || 'zh', { granularity: 'word' });
  } catch {
    segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  }
  let count = 0;
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    const word = part.segment.toLowerCase();
    if (FILLERS.has(word) || FILLER_CHARS.test(word)) continue;
    count += 1;
  }
  return count;
}

export function createCallTranscript({
  deps,
  now,
  push,
}: {
  deps: VoiceCallsDeps;
  now: () => number;
  push: (call: Call, event: EventInput) => void;
}) {
  const dropStream = (call: Call) => {
    call.stream?.cancel();
    call.stream = undefined;
    call.segments = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
  };

  const recognize = async (call: Call, pcm: Int16Array): Promise<string> => {
    const bot = deps.bot(call.slug);
    if (bot?.asr === undefined) throw new VoiceError('unknown-provider', 'No ASR Provider.');
    let wav: Uint8Array | undefined = wavFromPcm16(pcm, VAD_SAMPLE_RATE);
    pcm.fill(0);
    try {
      return (
        await deps.providers.transcribe({
          providerId: bot.asr.providerId,
          audio: wav,
          language: bot.asr.language,
          signal: call.abort.signal,
        })
      ).text;
    } finally {
      wav.fill(0);
      wav = undefined;
    }
  };

  const segment = (call: Call, pcm: Int16Array) => {
    const segments = call.segments;
    if (segments === undefined) return;
    const index = segments.parts.length;
    const part = recognize(call, pcm).then((text) => {
      segments.texts[index] = text;
      if (call.segments === segments && !ended(call)) {
        const done: string[] = [];
        for (const piece of segments.texts) {
          if (piece === undefined) break;
          done.push(piece);
        }
        hearing(call, joinTranscripts(done));
      }
      return text;
    });
    part.catch(() => undefined);
    segments.parts.push(part);
  };

  const startStream = (call: Call) => {
    dropStream(call);
    if (call.segmented) {
      call.segments = { parts: [], texts: [] };
      return;
    }
    const bot = deps.bot(call.slug);
    if (bot?.asr === undefined || deps.providers.openStream === undefined) return;
    let stream: AsrStream | undefined;
    try {
      stream = deps.providers.openStream({
        providerId: bot.asr.providerId,
        language: bot.asr.language,
        signal: call.abort.signal,
        onText: (text) => {
          if (call.stream !== stream || ended(call)) return;
          hearing(call, text);
        },
      });
    } catch {
      stream = undefined;
    }
    call.stream = stream;
  };

  const flushHearing = (call: Call) => {
    const state = call.hearing;
    if (state === undefined) return;
    clearTimeout(state.timer);
    state.timer = undefined;
    state.pushedAt = now();
    push(call, {
      type: 'hearing',
      text: state.text.slice(0, MAX_HEARING_CHARS),
    });
  };

  const hearing = (call: Call, text: string) => {
    if (text === '' || text === call.hearing?.text) return;
    const state = (call.hearing ??= { text, pushedAt: 0 });
    state.text = text;
    const wait = state.pushedAt + HEARING_EVENT_MS - now();
    if (wait <= 0) flushHearing(call);
    else if (state.timer === undefined) {
      state.timer = setTimeout(() => {
        if (call.hearing === state && !ended(call)) flushHearing(call);
      }, wait);
      state.timer.unref?.();
    }
  };

  return { dropStream, recognize, segment, startStream };
}

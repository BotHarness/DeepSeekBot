import { speakableText } from './speakable.js';

const SOFT_SENTENCE_CHARS = 48;

const HARD_END = /[。！？!?…；;]/u;
const SOFT_END = /[，,、：:]/u;
const CLOSERS = /["'”’）)」』\]]/u;

function clean(sentence: string): string {
  return sentence
    .replace(/[*`~]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function speakableSentences(markdown: string, final: boolean): string[] {
  const text = speakableText(markdown);
  const out: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    let end = false;
    if (HARD_END.test(char)) end = true;
    else if (char === '.')
      end = next === undefined ? false : /\s/u.test(next) && !/\d/u.test(text[index - 1] ?? '');
    else if (SOFT_END.test(char) && index - start >= SOFT_SENTENCE_CHARS)
      end = next === undefined || /\s/u.test(next) || !/[.\d]/u.test(next);
    if (!end) continue;
    let stop = index + 1;
    while (stop < text.length && (HARD_END.test(text[stop]!) || CLOSERS.test(text[stop]!)))
      stop += 1;
    if (stop >= text.length && !final) break;
    const sentence = clean(text.slice(start, stop));
    if (sentence !== '' && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
    start = stop;
    index = stop - 1;
  }
  if (final) {
    const rest = clean(text.slice(start));
    if (rest !== '' && /[\p{L}\p{N}]/u.test(rest)) out.push(rest);
  }
  return out;
}

export interface AudioClip {
  readonly audio: Uint8Array;
  readonly mime: string;
}

function id3Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  return Math.min(bytes.length, 10 + size + footer);
}

interface WavParts {
  readonly format: Uint8Array;
  readonly data: Uint8Array;
}

function wavParts(bytes: Uint8Array): WavParts | undefined {
  const ascii = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 4, bytes.length)));
  if (bytes.length < 44 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: Uint8Array | undefined;
  let data: Uint8Array | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = ascii(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') format = bytes.subarray(body, Math.min(bytes.length, body + size));
    else if (id === 'data') data = bytes.subarray(body, Math.min(bytes.length, body + size));
    offset = body + size + (size % 2);
  }
  return format === undefined || data === undefined ? undefined : { format, data };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function joinWav(parts: readonly WavParts[]): Uint8Array {
  const format = parts[0]!.format;
  const dataLength = parts.reduce((sum, part) => sum + part.data.length, 0);
  const out = new Uint8Array(12 + 8 + format.length + 8 + dataLength);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < 4; index += 1) out[offset + index] = text.charCodeAt(index);
  };
  write(0, 'RIFF');
  view.setUint32(4, out.length - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, format.length, true);
  out.set(format, 20);
  let offset = 20 + format.length;
  write(offset, 'data');
  view.setUint32(offset + 4, dataLength, true);
  offset += 8;
  for (const part of parts) {
    out.set(part.data, offset);
    offset += part.data.length;
  }
  return out;
}

export function joinAudio(clips: readonly AudioClip[]): AudioClip | undefined {
  if (clips.length === 0) return undefined;
  if (clips.length === 1) return { audio: clips[0]!.audio, mime: clips[0]!.mime };
  const mime = clips[0]!.mime;
  if (clips.some((clip) => clip.mime !== mime)) return undefined;
  if (mime === 'audio/mpeg') {
    const pieces = clips.map((clip, index) =>
      index === 0 ? clip.audio : clip.audio.subarray(id3Length(clip.audio)),
    );
    const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let offset = 0;
    for (const piece of pieces) {
      out.set(piece, offset);
      offset += piece.length;
    }
    return { audio: out, mime };
  }
  if (mime === 'audio/ogg') {
    const out = new Uint8Array(clips.reduce((sum, clip) => sum + clip.audio.length, 0));
    let offset = 0;
    for (const clip of clips) {
      out.set(clip.audio, offset);
      offset += clip.audio.length;
    }
    return { audio: out, mime };
  }
  if (mime === 'audio/wav') {
    const parts = clips.map((clip) => wavParts(clip.audio));
    if (parts.some((part) => part === undefined)) return undefined;
    const first = parts[0]!;
    if (parts.some((part) => !sameBytes(part!.format, first.format))) return undefined;
    return { audio: joinWav(parts as WavParts[]), mime };
  }
  return undefined;
}

const MP3_BITRATES: Record<string, readonly number[]> = {
  '1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES: Record<number, readonly number[]> = {
  3: [44_100, 48_000, 32_000],
  2: [22_050, 24_000, 16_000],
  0: [11_025, 12_000, 8_000],
};

function mp3Walk(
  bytes: Uint8Array,
  limitMs = Infinity,
): { ms: number; end: number; frames: number } {
  let offset = id3Length(bytes);
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length && seconds * 1000 < limitMs) {
    const b1 = bytes[offset + 1]!;
    if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (b1 >> 3) & 0x03;
    const layer = (b1 >> 1) & 0x03;
    const b2 = bytes[offset + 2]!;
    const bitrate = MP3_BITRATES[version === 3 ? '1' : '2']![(b2 >> 4) & 0x0f] ?? 0;
    const rate = MP3_RATES[version]?.[(b2 >> 2) & 0x03];
    if (layer !== 1 || version === 1 || bitrate === 0 || rate === undefined) {
      offset += 1;
      continue;
    }
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor((samples / 8) * ((bitrate * 1000) / rate)) + ((b2 >> 1) & 0x01);
    if (length < 4) break;
    seconds += samples / rate;
    frames += 1;
    offset += length;
  }
  return { ms: seconds * 1000, end: Math.min(offset, bytes.length), frames };
}

function mp3DurationMs(bytes: Uint8Array): number | undefined {
  const walk = mp3Walk(bytes);
  return walk.frames === 0 ? undefined : walk.ms;
}

export function trimAudio(clip: AudioClip, ms: number): AudioClip | undefined {
  if (!(ms > 0)) return undefined;
  if (ms >= clipDurationMs(clip)) return { audio: clip.audio, mime: clip.mime };
  if (clip.mime === 'audio/wav') {
    const parts = wavParts(clip.audio);
    if (parts === undefined || parts.format.length < 16) return undefined;
    const view = new DataView(parts.format.buffer, parts.format.byteOffset);
    const byteRate = view.getUint32(8, true);
    const block = Math.max(1, view.getUint16(12, true));
    const cut = Math.floor((ms * byteRate) / 1000 / block) * block;
    if (cut <= 0) return undefined;
    return {
      audio: joinWav([{ format: parts.format, data: parts.data.subarray(0, cut) }]),
      mime: clip.mime,
    };
  }
  if (clip.mime === 'audio/mpeg') {
    const walk = mp3Walk(clip.audio, ms);
    return walk.frames === 0
      ? undefined
      : { audio: clip.audio.slice(0, walk.end), mime: clip.mime };
  }
  return undefined;
}

function oggDurationMs(bytes: Uint8Array): number | undefined {
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256))).toString('latin1');
  let rate = 48_000;
  const vorbis = text.indexOf('\u0001vorbis');
  if (vorbis >= 0 && vorbis + 16 <= bytes.length)
    rate = new DataView(bytes.buffer, bytes.byteOffset).getUint32(vorbis + 12, true) || rate;
  let granule = -1;
  let skip = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 27 <= bytes.length;) {
    if (view.getUint32(offset) !== 0x4f676753) {
      offset += 1;
      continue;
    }
    const position = Number(view.getBigInt64(offset + 6, true));
    if (position >= 0) granule = position;
    const segments = bytes[offset + 26]!;
    const packet = offset + 27 + segments;
    if (skip === 0 && packet + 12 <= bytes.length && text.slice(packet, packet + 8) === 'OpusHead')
      skip = view.getUint16(packet + 10, true);
    let length = 27 + segments;
    for (let index = 0; index < segments && offset + 27 + index < bytes.length; index += 1)
      length += bytes[offset + 27 + index]!;
    offset += length;
  }
  return granule <= 0 ? undefined : (Math.max(0, granule - skip) / rate) * 1000;
}

export function clipDurationMs(clip: AudioClip): number {
  let ms: number | undefined;
  if (clip.mime === 'audio/wav') {
    const parts = wavParts(clip.audio);
    if (parts !== undefined && parts.format.length >= 16) {
      const view = new DataView(parts.format.buffer, parts.format.byteOffset);
      const byteRate = view.getUint32(8, true);
      if (byteRate > 0) ms = (parts.data.length / byteRate) * 1000;
    }
  } else if (clip.mime === 'audio/mpeg') ms = mp3DurationMs(clip.audio);
  else if (clip.mime === 'audio/ogg') ms = oggDurationMs(clip.audio);
  return Math.round(ms ?? (clip.audio.byteLength / 16_000) * 1000);
}

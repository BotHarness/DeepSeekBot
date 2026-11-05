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

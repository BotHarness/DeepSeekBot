export const PCM_SAMPLE_RATE = 16_000;

export type PcmErrorCode = 'invalid' | 'too-large';

export class PcmError extends Error {
  constructor(
    readonly code: PcmErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function pcmToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1)
    view.setInt16(index * 2, samples[index]!, true);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function pcmFromBase64(value: string, options: { maxBytes?: number } = {}): Int16Array {
  if (options.maxBytes !== undefined && value.length > (options.maxBytes * 4) / 3 + 4)
    throw new PcmError('too-large', 'The audio chunk is too large.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new PcmError('invalid', 'pcm must be base64 16-bit little-endian samples.');
  }
  if (binary.length % 2 !== 0)
    throw new PcmError('invalid', 'pcm must be base64 16-bit little-endian samples.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const out = new Int16Array(bytes.length / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = view.getInt16(index * 2, true);
  bytes.fill(0);
  return out;
}

function boxAverage(
  frames: number,
  rate: number,
  read: (start: number, end: number) => number,
  write: (index: number, mean: number) => void,
): number {
  const ratio = rate / PCM_SAMPLE_RATE;
  const length = Math.floor(frames / ratio);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(frames, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    write(index, read(start, end));
  }
  return length;
}

export function pcm16kFromFloat(input: Float32Array, rate: number): Int16Array {
  const out = new Int16Array(Math.floor(input.length / (rate / PCM_SAMPLE_RATE)));
  boxAverage(
    input.length,
    rate,
    (start, end) => {
      let sum = 0;
      for (let at = start; at < end; at += 1) sum += input[at]!;
      return sum / (end - start);
    },
    (index, mean) => {
      const sample = Math.max(-1, Math.min(1, mean));
      out[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    },
  );
  return out;
}

export function pcm16kFromInt16(raw: Int16Array, rate: number, channels = 1): Int16Array {
  const width = Math.max(1, channels);
  if (width === 1 && rate === PCM_SAMPLE_RATE) return raw;
  const frames = Math.floor(raw.length / width);
  const out = new Int16Array(Math.floor(frames / (rate / PCM_SAMPLE_RATE)));
  boxAverage(
    frames,
    rate,
    (start, end) => {
      let sum = 0;
      for (let frame = start; frame < end; frame += 1)
        for (let channel = 0; channel < width; channel += 1) sum += raw[frame * width + channel]!;
      return sum / ((end - start) * width);
    },
    (index, mean) => {
      out[index] = Math.round(mean);
    },
  );
  return out;
}

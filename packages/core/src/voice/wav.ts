export function readWavAs16kMono(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 4, bytes.length)));
  if (bytes.length < 44 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE')
    throw new Error('The file is not a WAV file.');
  let format: { channels: number; rate: number; bits: number; code: number } | undefined;
  let data: { offset: number; length: number } | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = ascii(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && size >= 16)
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    else if (id === 'data') data = { offset: body, length: Math.min(size, bytes.length - body) };
    offset = body + size + (size % 2);
  }
  if (format === undefined || data === undefined) throw new Error('The WAV file has no audio.');
  if ((format.code !== 1 && format.code !== 0xfffe) || format.bits !== 16)
    throw new Error('The WAV file must hold 16-bit PCM audio.');
  if (format.channels < 1 || format.channels > 8 || format.rate < 8_000 || format.rate > 192_000)
    throw new Error('The WAV format is not supported.');
  const frames = Math.floor(data.length / (2 * format.channels));
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1)
      sum += view.getInt16(data.offset + (frame * format.channels + channel) * 2, true);
    mono[frame] = sum / format.channels;
  }
  if (format.rate === 16_000) return Int16Array.from(mono, (value) => Math.round(value));
  const ratio = format.rate / 16_000;
  const out = new Int16Array(Math.floor(frames / ratio));
  for (let index = 0; index < out.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(frames - 1, left + 1);
    const weight = position - left;
    out[index] = Math.round(mono[left]! * (1 - weight) + mono[right]! * weight);
  }
  return out;
}

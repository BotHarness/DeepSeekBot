export const RATE = 16_000;

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

const amplitude = (dbfs: number) => 10 ** (dbfs / 20) * 32767;

export function speech(ms: number, options: { dbfs?: number; f0?: number; seed?: number } = {}) {
  const count = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(count);
  const peak = amplitude(options.dbfs ?? -18);
  const f0 = options.f0 ?? 150;
  const noise = rng(options.seed ?? 7);
  let phase = 0;
  for (let index = 0; index < count; index += 1) {
    const t = index / RATE;
    const pitch = f0 * (1 + 0.08 * Math.sin(2 * Math.PI * 1.3 * t));
    phase += (2 * Math.PI * pitch) / RATE;
    let sample = 0;
    for (let harmonic = 1; harmonic <= 8; harmonic += 1)
      sample += Math.sin(phase * harmonic) / harmonic;
    const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t) ** 2;
    const edge = Math.min(1, t / 0.03, (ms / 1000 - t) / 0.03);
    out[index] = Math.round((sample * 0.5 * syllable * edge + noise() * 0.01) * peak);
  }
  return out;
}

export function cough(ms = 350, options: { dbfs?: number; seed?: number } = {}) {
  const count = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(count);
  const peak = amplitude(options.dbfs ?? -12);
  const noise = rng(options.seed ?? 11);
  let low = 0;
  for (let index = 0; index < count; index += 1) {
    const t = index / RATE;
    low = low * 0.6 + noise() * 0.4;
    const envelope = Math.min(1, t / 0.01) * Math.exp(-t / (ms / 1000 / 3));
    out[index] = Math.round(low * envelope * peak);
  }
  return out;
}

export function knock(ms = 60, options: { dbfs?: number } = {}) {
  const count = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(count);
  const peak = amplitude(options.dbfs ?? -8);
  for (let index = 0; index < count; index += 1) {
    const t = index / RATE;
    out[index] = Math.round(Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.015) * peak);
  }
  return out;
}

export function silence(ms: number, options: { dbfs?: number; seed?: number } = {}) {
  const count = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(count);
  const peak = amplitude(options.dbfs ?? -62);
  const noise = rng(options.seed ?? 3);
  for (let index = 0; index < count; index += 1) out[index] = Math.round(noise() * peak);
  return out;
}

export function concat(...parts: Int16Array[]) {
  const out = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function chunks(samples: Int16Array, size = 320) {
  const out: Int16Array[] = [];
  for (let offset = 0; offset < samples.length; offset += size)
    out.push(samples.slice(offset, offset + size));
  return out;
}

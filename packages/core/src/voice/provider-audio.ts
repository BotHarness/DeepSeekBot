export function sniffAudio(bytes: Uint8Array, declared: string | null): string | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  const type = declared?.split(';')[0]?.trim().toLowerCase();
  if (type !== undefined && type.startsWith('audio/') && bytes.length > 0) return type;
  return undefined;
}

export function audioExtension(mime: string): string {
  return (
    {
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
    }[mime] ?? 'audio'
  );
}

export function chineseScript(language: string | undefined): string | undefined {
  if (language === undefined || !/^zh(?:$|-)/iu.test(language)) return undefined;
  return /^zh-(?:tw|hk|mo|hant)$/iu.test(language)
    ? '以下是普通話的句子，使用繁體中文。'
    : '以下是普通话的句子，使用简体中文。';
}

export function wavFromPcm16(samples: Int16Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      out[offset + index] = text.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.byteLength, true);
  for (let index = 0; index < samples.length; index += 1)
    view.setInt16(44 + index * 2, samples[index]!, true);
  return out;
}

export function silenceWav(sampleRate: number, milliseconds: number): Uint8Array {
  return wavFromPcm16(new Int16Array(Math.round((sampleRate * milliseconds) / 1000)), sampleRate);
}

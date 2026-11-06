import { describe, expect, it } from 'vitest';

import { wavFromPcm16 } from '../src/voice/providers.js';
import { clipDurationMs, joinAudio, speakableSentences, trimAudio } from '../src/voice/speech.js';
import { readWavAs16kMono } from '../src/voice/wav.js';

describe('call sentences', () => {
  it('cuts Chinese and English replies into sentences and holds back the growing tail', () => {
    expect(speakableSentences('好的。我查一下明天的天气！稍等', false)).toEqual([
      '好的。',
      '我查一下明天的天气！',
    ]);
    expect(speakableSentences('好的。我查一下明天的天气！稍等', true)).toEqual([
      '好的。',
      '我查一下明天的天气！',
      '稍等。',
    ]);
    expect(speakableSentences('Sure. It costs 3.50 today. And', false)).toEqual([
      'Sure.',
      'It costs 3.50 today.',
    ]);
    expect(speakableSentences('好的。', false)).toEqual([]);
    expect(speakableSentences('“好的！”她说。', true)).toEqual(['“好的！”', '她说。']);
  });

  it('gives a draft the same leading sentences as the message it becomes', () => {
    const body =
      '**结果**：测试全部通过。\n\n```sh\npnpm test\n```\n\n详情见 `docs/guide.md`，有问题再找我。';
    const final = speakableSentences(body, true);
    for (let length = 1; length < body.length; length += 1) {
      const draft = speakableSentences(body.slice(0, length), false);
      expect(final.slice(0, draft.length)).toEqual(draft);
    }
    expect(final.join('')).not.toMatch(/[*`]/u);
  });

  it('cuts a long sentence after a comma so the first audio starts sooner', () => {
    const long = '这是一个非常长的句子，'.repeat(6) + '最后结束。';
    const sentences = speakableSentences(long, true);
    expect(sentences.length).toBeGreaterThan(1);
    expect(sentences.join('')).toBe(long);
  });
});

describe('joining spoken clips', () => {
  it('chains MP3 clips and drops the ID3 header of later ones', () => {
    const tag = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 9, 9];
    const joined = joinAudio([
      { audio: new Uint8Array([...tag, 1, 2]), mime: 'audio/mpeg' },
      { audio: new Uint8Array([...tag, 3, 4]), mime: 'audio/mpeg' },
    ]);
    expect(joined).toEqual({ audio: new Uint8Array([...tag, 1, 2, 3, 4]), mime: 'audio/mpeg' });
  });

  it('merges WAV clips of one format into one WAV', () => {
    const first = Int16Array.from({ length: 160 }, (_, index) => index);
    const second = Int16Array.from({ length: 80 }, (_, index) => -index);
    const joined = joinAudio([
      { audio: wavFromPcm16(first, 16_000), mime: 'audio/wav' },
      { audio: wavFromPcm16(second, 16_000), mime: 'audio/wav' },
    ])!;
    expect(joined.mime).toBe('audio/wav');
    expect([...readWavAs16kMono(joined.audio)]).toEqual([...first, ...second]);
    expect(
      joinAudio([
        { audio: wavFromPcm16(first, 16_000), mime: 'audio/wav' },
        { audio: wavFromPcm16(second, 24_000), mime: 'audio/wav' },
      ]),
    ).toBeUndefined();
  });

  it('refuses clips it cannot join', () => {
    expect(joinAudio([])).toBeUndefined();
    expect(
      joinAudio([
        { audio: new Uint8Array([1]), mime: 'audio/flac' },
        { audio: new Uint8Array([2]), mime: 'audio/flac' },
      ]),
    ).toBeUndefined();
    expect(
      joinAudio([
        { audio: new Uint8Array([1]), mime: 'audio/mpeg' },
        { audio: new Uint8Array([2]), mime: 'audio/wav' },
      ]),
    ).toBeUndefined();
  });
});

describe('clip duration', () => {
  it('trims WAV and MP3 to the part that played and gives up on other formats', () => {
    const wav = { audio: wavFromPcm16(new Int16Array(32_000), 16_000), mime: 'audio/wav' };
    expect(clipDurationMs(trimAudio(wav, 750)!)).toBe(750);
    expect(trimAudio(wav, 5_000)).toEqual(wav);
    expect(trimAudio(wav, 0)).toBeUndefined();

    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    const mp3 = new Uint8Array(417 * 10);
    for (let index = 0; index < 10; index += 1) mp3.set(frame, index * 417);
    const cut = trimAudio({ audio: mp3, mime: 'audio/mpeg' }, 100)!;
    expect(cut.audio.byteLength).toBe(417 * 4);
    expect(clipDurationMs(cut)).toBe(104);

    expect(trimAudio({ audio: new Uint8Array(64_000), mime: 'audio/ogg' }, 500)).toBeUndefined();
  });

  it('reads WAV, MP3 frames and Ogg Opus granules, and guesses for anything else', () => {
    const pcm = new Int16Array(16_000);
    expect(clipDurationMs({ audio: wavFromPcm16(pcm, 16_000), mime: 'audio/wav' })).toBe(1_000);

    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    const mp3 = new Uint8Array(417 * 10);
    for (let index = 0; index < 10; index += 1) mp3.set(frame, index * 417);
    expect(clipDurationMs({ audio: mp3, mime: 'audio/mpeg' })).toBe(261);

    const page = (granule: bigint, payload: Uint8Array) => {
      const out = new Uint8Array(28 + payload.length);
      const view = new DataView(out.buffer);
      out.set([0x4f, 0x67, 0x67, 0x53]);
      view.setBigInt64(6, granule, true);
      out[26] = 1;
      out[27] = payload.length;
      out.set(payload, 28);
      return out;
    };
    const head = new Uint8Array(19);
    head.set(Buffer.from('OpusHead'));
    new DataView(head.buffer).setUint16(10, 312, true);
    const ogg = Buffer.concat([page(0n, head), page(48_312n, new Uint8Array(10))]);
    expect(clipDurationMs({ audio: new Uint8Array(ogg), mime: 'audio/ogg' })).toBe(1_000);

    expect(clipDurationMs({ audio: new Uint8Array(8_000), mime: 'audio/aac' })).toBe(500);
  });
});

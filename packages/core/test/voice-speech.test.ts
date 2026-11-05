import { describe, expect, it } from 'vitest';

import { wavFromPcm16 } from '../src/voice/providers.js';
import { joinAudio, speakableSentences } from '../src/voice/speech.js';
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

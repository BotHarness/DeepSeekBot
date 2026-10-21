import { expect, it } from 'vitest';
import { beatHold, beatStart, speechBeats, speechText } from '../src/client/companion-beats.js';
import { messageGraphemeBoundaries } from '../../core/src/channels/message-preview.js';

const beats = (body: string): string[] => {
  const ends = speechBeats(body, messageGraphemeBoundaries(body));
  return ends.map((end) => body.slice(beatStart(ends, end), end).trim());
};

it('splits speech into sentence beats across scripts, quotes and line breaks', () => {
  expect(beats('好的，我先看一下。然后再改！可以吗？')).toEqual([
    '好的，我先看一下。',
    '然后再改！',
    '可以吗？',
  ]);
  expect(beats('He said "done." Then left... OK')).toEqual([
    'He said "done."',
    'Then left...',
    'OK',
  ]);
  expect(beats('「好了。」继续\n\n下一段')).toEqual(['「好了。」', '继续', '下一段']);
  expect(beats('version 1.2 ships')).toEqual(['version 1.2 ships']);
  expect(beats('👩‍💻 done!')).toEqual(['👩‍💻 done!']);
});

it('caps a beat without punctuation, preferring a soft break, and never leaves an empty tail', () => {
  const words = Array.from({ length: 30 }, (_, index) => `w${index}`).join(' ');
  const split = beats(words);
  expect(split.length).toBeGreaterThan(1);
  expect(split.join(' ')).toBe(words);
  expect(split.every((beat) => [...beat].length <= 72)).toBe(true);
  expect(beats('x'.repeat(150)).map((beat) => beat.length)).toEqual([72, 72, 6]);
  expect(beats('Done.\n\n')).toEqual(['Done.']);
});

it('holds a finished beat for reading time, shorter when another message waits', () => {
  expect(beatHold('First sentence here.', false, false)).toBe(1500);
  expect(beatHold('x'.repeat(200), false, false)).toBe(3000);
  expect(beatHold('Hi.', true, false)).toBe(2500);
  expect(beatHold('x'.repeat(200), true, false)).toBe(8000);
  expect(beatHold('Hi.', true, true)).toBe(1590);
});

it('caps beats at a shorter page limit for bubbles that fit fewer lines', () => {
  const body =
    '窗外的天刚泛白，远处几栋写字楼还没亮灯，楼下早点铺的蒸笼冒着白气，一个穿蓝色外套的人推着自行车慢慢走过斑马线';
  const ends = speechBeats(body, messageGraphemeBoundaries(body), 40);
  const pages = ends.map((end, index) => body.slice(ends[index - 1] ?? 0, end));
  expect(pages.join('')).toBe(body);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.every((page) => [...page].length <= 40)).toBe(true);
});

it('turns Markdown into plain spoken text', () => {
  expect(
    speechText(
      [
        '## 家底',
        '| Bot | 定位 | 状态 |',
        '|---|:---:|---|',
        '| Tob | 本地管家 | 在线 |',
        '| Ada | **测试** | `idle` |',
        '',
        '- 第一条',
        '2. 第二条',
        '```ts',
        'const x = 1;',
        '```',
        '---',
        '一句话：**都好**。',
      ].join('\n'),
    ),
  ).toBe(
    [
      '家底',
      'Tob · 本地管家 · 在线',
      'Ada · 测试 · idle',
      '',
      '第一条',
      '第二条',
      '一句话：都好。',
    ].join('\n'),
  );
});

it('joins short sentences into one page and keeps clock times together', () => {
  const body =
    '冬季横幅齐全；无头像；状态从 13:35 跳到 14:13，是因为整点同步时有一次时区换算，现在已经恢复正常了。';
  const ends = speechBeats(body, messageGraphemeBoundaries(body), 40, 10);
  const pages = ends.map((end, index) => body.slice(ends[index - 1] ?? 0, end));
  expect(pages.join('')).toBe(body);
  expect(pages[0]).toBe('冬季横幅齐全；无头像；');
  expect(pages.every((page) => [...page].length <= 40)).toBe(true);
  expect(pages.some((page) => page.includes('13:35') && page.includes('14:13'))).toBe(true);
});

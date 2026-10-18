vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Input: () => null }));
import { expect, it, vi } from 'vitest';
import { searchSettings } from '../src/client/settings-search.js';
import { zhTranslate } from '../src/client/locale.js';
const rows = [
  { id: 'appearance', order: 5, label: '界面设置' },
  { id: 'messaging', order: 20, label: '消息' },
  { id: 'notifications', order: 21, label: '通知' },
  { id: 'browser', order: 32, label: '浏览器控制' },
];
it('finds settings across unmounted sections and returns the exact destination', () => {
  expect(searchSettings(rows, '间距', zhTranslate)).toEqual([
    { section: 'appearance', title: '面板间距', target: '面板间距', page: '界面设置' },
  ]);
  expect(searchSettings(rows, 'follow system', zhTranslate)[0]).toMatchObject({
    section: 'appearance',
    target: '主题',
  });
  expect(searchSettings(rows, '发送', zhTranslate).some((row) => row.section === 'messaging')).toBe(
    true,
  );
});
it('uses only registered sections, finds contributed pages and handles empty searches', () => {
  expect(searchSettings(rows, '浏览器', zhTranslate)[0]).toMatchObject({ section: 'browser' });
  expect(searchSettings([], '间距', zhTranslate)).toEqual([]);
  expect(searchSettings(rows, '  ', zhTranslate)).toEqual([]);
  expect(searchSettings(rows, 'no-matching-setting', zhTranslate)).toEqual([]);
});

it('does not advertise layout controls when the responsive workspace is unavailable', () => {
  expect(
    searchSettings(
      rows.map((row) => ({ ...row, layoutAvailable: false })),
      '间距',
      zhTranslate,
    ),
  ).toEqual([]);
  expect(
    searchSettings(rows, 'Enter', zhTranslate).some((row) => row.section === 'messaging'),
  ).toBe(true);
});

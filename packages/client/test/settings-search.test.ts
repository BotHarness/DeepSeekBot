vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Input: () => null }));
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLUGIN_INDEX,
  SETTINGS_DESCRIPTIONS,
  SETTINGS_INDEX,
  searchSettings,
} from '../src/client/settings-search.js';
import { en, zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';
import { CLIENT_ENTRY, registeredSections, scanSettingsRows } from './settings-rows-scan.js';
const rows = [
  { id: 'appearance', order: 5, label: '界面设置' },
  { id: 'messaging', order: 20, label: '消息' },
  { id: 'notifications', order: 21, label: '通知' },
  { id: 'browser', order: 32, label: '浏览器控制' },
];
it('finds the long-message folding switch in Messages in either language', () => {
  for (const query of ['折叠', 'collapse']) {
    expect(searchSettings(rows, query, zhTranslate)[0]).toMatchObject({
      section: 'messaging',
      target: '自动折叠长消息',
    });
  }
});
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

it('matches pinyin and English words in the Chinese interface', () => {
  expect(searchSettings(rows, 'jianju', zhTranslate)[0]).toMatchObject({ title: '面板间距' });
  expect(searchSettings(rows, 'mbjj', zhTranslate)[0]).toMatchObject({ title: '面板间距' });
  expect(searchSettings(rows, 'notifications', zhTranslate)[0]).toMatchObject({
    section: 'notifications',
    title: '通知',
  });
  expect(searchSettings(rows, 'tongzhi', zhTranslate)[0]).toMatchObject({
    section: 'notifications',
  });
});

it('lists every section for a bare settings query and finds sections by common words', () => {
  expect(
    searchSettings(rows, 'shezhi', zhTranslate)
      .filter((row) => row.target === undefined)
      .map((row) => row.section),
  ).toEqual(['appearance', 'messaging', 'notifications', 'browser']);
  expect(searchSettings(rows, 'waiguan', zhTranslate)[0]).toMatchObject({
    section: 'appearance',
    title: '界面设置',
  });
});

it('indexes only real locale keys and mirrors the plugin row titles', () => {
  for (const keys of Object.values(SETTINGS_INDEX))
    for (const key of keys) expect(zh[key], key).toBeTypeOf('string');
  const browser = readFileSync(
    new URL('../../browser/src/client/locale.ts', import.meta.url),
    'utf8',
  );
  const computer = readFileSync(
    new URL('../../computer/src/client/locale.ts', import.meta.url),
    'utf8',
  );
  const sources = { browser, computer } as Record<string, string>;
  for (const [section, items] of Object.entries(PLUGIN_INDEX))
    for (const item of items) {
      expect(sources[section], item.zh).toContain(`: '${item.zh}',`);
      expect(sources[section], item.en).toContain(`: '${item.en}',`);
    }
});

it('reaches individual rows on the right-hand side of every page', () => {
  const all = [
    ...rows,
    { id: 'shortcuts', order: 6, label: '快捷键' },
    { id: 'computer', order: 33, label: '电脑控制' },
  ];
  expect(searchSettings(all, 'mohu', zhTranslate)[0]).toMatchObject({
    section: 'appearance',
    target: '背景模糊',
  });
  expect(searchSettings(all, 'bizhi', zhTranslate)[0]).toMatchObject({
    section: 'appearance',
    title: '壁纸',
  });
  expect(searchSettings(all, 'kuaijie sousuo', zhTranslate)[0]).toMatchObject({
    section: 'shortcuts',
  });
  expect(searchSettings(all, 'local driver', zhTranslate)[0]).toMatchObject({
    section: 'browser',
    title: '本机驱动',
  });
  expect(searchSettings(all, 'zidong yunxu', zhTranslate)[0]).toMatchObject({
    section: 'computer',
    title: '自动允许 Computer 操作',
  });
  const enT = ((key: keyof typeof en) => en[key] ?? key) as unknown as typeof zhTranslate;
  expect(searchSettings(all, 'local driver', enT)[0]).toMatchObject({ title: 'Local driver' });
});

const zhSections = [
  { id: 'general', order: 0, label: '通用' },
  { id: 'appearance', order: 5, label: '界面设置' },
  { id: 'models', order: 10, label: '模型与运行' },
  { id: 'messaging', order: 20, label: '消息' },
  { id: 'prompts', order: 14, label: '提示词' },
  { id: 'voice', order: 15, label: '语音' },
  { id: 'devices', order: 40, label: '连接' },
  { id: 'data-privacy', order: 50, label: '数据与隐私' },
];
const enTranslate = ((key: keyof typeof en) => en[key] ?? key) as unknown as typeof zhTranslate;

it('finds the onboarding tutorial row by the words Humans use for it (#3768)', () => {
  for (const query of [
    '引导',
    '新手引导',
    '新手教程',
    '重新开始',
    '教程',
    'tutorial',
    'onboarding',
    'restart',
  ])
    expect(searchSettings(zhSections, query, zhTranslate)[0], query).toMatchObject({
      section: 'general',
      target: '新手教程',
    });
  expect(searchSettings(zhSections, 'tour', enTranslate)[0]).toMatchObject({
    section: 'general',
    target: 'Onboarding tutorial',
  });
  expect(searchSettings(zhSections, '通用 教程', zhTranslate)[0]).toMatchObject({
    target: '新手教程',
  });
});

it('finds rows by words that appear only in their description', () => {
  expect(searchSettings(zhSections, '记忆', zhTranslate).map((row) => row.target)).toContain(
    '新手教程',
  );
  expect(searchSettings(zhSections, '提示缓存', zhTranslate)[0]).toMatchObject({
    section: 'models',
    target: '空闲时提前压缩上下文',
  });
  expect(searchSettings(zhSections, 'prompt cache', enTranslate)[0]).toMatchObject({
    section: 'models',
  });
});

it('ranks a title match above a synonym and a synonym above a description', () => {
  const zoom = searchSettings(zhSections, '缩放', zhTranslate).map((row) => row.target);
  expect(zoom.slice(0, 2)).toEqual(['当前窗口缩放', '默认缩放']);
  expect(searchSettings(zhSections, '压缩', zhTranslate)[0]).toMatchObject({
    target: '空闲时提前压缩上下文',
  });
});

it('reaches rows in the newer sections', () => {
  const first = (query: string) => searchSettings(zhSections, query, zhTranslate)[0];
  expect(first('麦克风')).toMatchObject({ section: 'voice' });
  expect(first('说话阈值')).toMatchObject({ section: 'voice', target: '说话阈值' });
  expect(first('全局预设')).toMatchObject({ section: 'prompts', target: '全局预设' });
  expect(first('Tailscale')).toMatchObject({ section: 'devices', target: '通过 Tailscale' });
  expect(first('局域网')).toMatchObject({ section: 'devices', target: '同一局域网' });
  expect(first('备份')).toMatchObject({ section: 'data-privacy', target: '环境备份' });
  expect(first('逐字')).toMatchObject({ section: 'messaging', target: '逐字显示 Bot 回复' });
  expect(first('自动压缩阈值')).toMatchObject({ section: 'models' });
});

it('does not match descriptions by pinyin initials', () => {
  expect(
    searchSettings(zhSections, 'jy', zhTranslate).some((row) => row.target === '新手教程'),
  ).toBe(false);
});

it('every row registered Bot settings sections render is searchable by its title and description', () => {
  const notSettings = new Set([
    'accountProfile.loadFailed',
    'accountProfile.signInHint',
    'plugins.restart.title',
  ]);
  const missing: string[] = [];
  const sections = registeredSections();
  expect(sections.map((section) => section.id)).toContain('general');
  for (const section of sections) {
    const rows = scanSettingsRows(CLIENT_ENTRY, section.component);
    for (const row of rows) {
      if (row.key === undefined || notSettings.has(row.key)) continue;
      const key = row.key as BotHarnessKey;
      if (!(SETTINGS_INDEX[section.id] ?? []).includes(key))
        missing.push(`${section.id}: ${row.key} (${row.at})`);
      else if (row.description !== undefined && SETTINGS_DESCRIPTIONS[key] !== row.description)
        missing.push(`${section.id}: ${row.key} description ${row.description} (${row.at})`);
    }
  }
  expect(missing).toEqual([]);
});

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Input: () => null }));
import { expect, it, vi } from 'vitest';
import {
  PLUGIN_INDEX,
  SETTINGS_DESCRIPTIONS,
  SETTINGS_INDEX,
  searchSettings,
} from '../src/client/settings-search.js';
import { en, zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';
import { registeredSections, scanSettingsRows } from './settings-rows-scan.js';
import * as browserLocale from '../../browser/src/client/locale.js';
import * as computerLocale from '../../computer/src/client/locale.js';

const PLUGIN_LOCALES: Record<
  string,
  { zh: Record<string, string>; en: Record<string, string> } | undefined
> = { browser: browserLocale, computer: computerLocale };
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
it('finds settings nested under subsection headings and inside plugin pages', () => {
  const nested = [
    ...rows,
    { id: 'general', order: 1, label: '通用' },
    { id: 'voice', order: 22, label: '语音' },
    { id: 'devices', order: 30, label: '设备' },
    { id: 'computer', order: 33, label: 'Computer' },
  ];
  const first = (query: string) => searchSettings(nested, query, zhTranslate)[0];
  expect(first('毛玻璃')).toMatchObject({ section: 'appearance', target: '面板外观' });
  expect(first('启用窗口缩放')).toMatchObject({ section: 'general', target: '启用窗口缩放' });
  expect(first('语音识别')).toMatchObject({ section: 'voice' });
  expect(first('局域网 协作')).toMatchObject({ section: 'devices', target: '局域网 Bot 协作' });
  expect(first('自动允许')).toMatchObject({
    section: 'computer',
    target: '自动允许 Computer 操作',
  });
  expect(first('归档')).toMatchObject({ section: 'computer' });
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

it('indexes only real locale keys and mirrors the plugin row strings', () => {
  for (const keys of Object.values(SETTINGS_INDEX))
    for (const key of keys) expect(zh[key], key).toBeTypeOf('string');
  for (const [section, items] of Object.entries(PLUGIN_INDEX)) {
    const locale = PLUGIN_LOCALES[section];
    expect(locale, section).toBeDefined();
    const zhValues = Object.values(locale!.zh);
    const enValues = Object.values(locale!.en);
    for (const item of items) {
      expect(zhValues, item.zh).toContain(item.zh);
      expect(enValues, item.en).toContain(item.en);
      if (item.description) {
        expect(zhValues, item.description.zh).toContain(item.description.zh);
        expect(enValues, item.description.en).toContain(item.description.en);
      }
    }
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
  expect(
    searchSettings(zhSections, '局域网', zhTranslate)
      .slice(0, 2)
      .map((row) => row.target),
  ).toEqual(expect.arrayContaining(['同一局域网', '局域网 Bot 协作']));
  expect(first('备份')).toMatchObject({ section: 'data-privacy', target: '环境备份' });
  expect(first('逐字')).toMatchObject({ section: 'messaging', target: '逐字显示 Bot 回复' });
  expect(first('自动压缩阈值')).toMatchObject({ section: 'models' });
});

it('does not match descriptions by pinyin initials', () => {
  expect(
    searchSettings(zhSections, 'jy', zhTranslate).some((row) => row.target === '新手教程'),
  ).toBe(false);
});

it('every row and heading registered Bot settings sections render is searchable', () => {
  const notSettings = new Set([
    'accountProfile.loadFailed',
    'accountProfile.signInHint',
    'plugins.restart.title',
  ]);
  const missing: string[] = [];
  const sections = registeredSections();
  expect(sections.map((section) => section.id)).toEqual(
    expect.arrayContaining(['general', 'voice', 'devices', 'browser', 'computer']),
  );
  for (const section of sections) {
    const rows = scanSettingsRows(section.entry, section.component);
    const plugin = PLUGIN_LOCALES[section.id];
    for (const row of rows) {
      const keys = row.keys.filter((key) => !notSettings.has(key));
      if (plugin) {
        const items = PLUGIN_INDEX[section.id] ?? [];
        for (const key of keys) {
          const item = items.find((candidate) => candidate.zh === plugin.zh[key]);
          if (!item) missing.push(`${section.id}: ${key} (${row.at})`);
          const [description] = row.descriptions;
          if (
            item &&
            row.descriptions.length === 1 &&
            item.description?.zh !== plugin.zh[description!]
          )
            missing.push(`${section.id}: ${key} description ${description} (${row.at})`);
        }
        continue;
      }
      for (const key of keys as BotHarnessKey[]) {
        if (!(SETTINGS_INDEX[section.id] ?? []).includes(key))
          missing.push(`${section.id}: ${row.kind} ${key} (${row.at})`);
        else if (
          row.descriptions.length === 1 &&
          SETTINGS_DESCRIPTIONS[key] !== row.descriptions[0]
        )
          missing.push(`${section.id}: ${key} description ${row.descriptions[0]} (${row.at})`);
      }
    }
  }
  expect(missing).toEqual([]);
});

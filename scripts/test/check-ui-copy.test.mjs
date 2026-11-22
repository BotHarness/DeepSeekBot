import { describe, expect, it } from 'vitest';
import { collect, compare, duplicateKeys, findings, fixSource, RULES } from '../check-ui-copy.mjs';

const source = `
export const zh = {
  'a.saved': '已保存,稍后生效',
  'a.market': 'Bot市场',
  'a.retry': '保存失败，请重试。',
  'a.invite': '邀请已失效，请生成新的邀请。',
  'a.notify': '请在系统设置中允许通知。',
  'a.request': '待确认请求',
  'a.long': '第一句。第二句。第三句。',
  'a.deleteConfirm': '删除后无法恢复。所有消息都会消失。确定吗？',
  'a.count': \`共 \${count} 个(已选)\`,
} as const;
export const en = {
  'a.retry': 'Could not save. Please try again.',
  'a.ok': 'Saved',
};
`;

describe('check-ui-copy', () => {
  const strings = collect(source, 'client');

  it('reads every string under zh and en with a stable id', () => {
    expect(strings.map((entry) => entry.id)).toContain('client:zh.a.count');
    expect(strings.find((entry) => entry.id === 'client:zh.a.count').text).toBe('共 {…} 个(已选)');
  });

  it('flags each rule and leaves allowed copy alone', () => {
    expect(findings(strings)).toEqual({
      zhPunctuation: ['client:zh.a.count', 'client:zh.a.saved'],
      zhSpacing: ['client:zh.a.market'],
      zhPlease: ['client:zh.a.invite', 'client:zh.a.retry'],
      enPlease: ['client:en.a.retry'],
      zhLong: ['client:zh.a.long'],
    });
  });

  it('fixes punctuation and spacing in place, inside template literals too', () => {
    const fixed = fixSource(source, strings);
    expect(fixed).toContain("'a.saved': '已保存，稍后生效'");
    expect(fixed).toContain("'a.market': 'Bot 市场'");
    expect(fixed).toContain('`共 ${count} 个（已选）`');
    expect(fixed).toContain("'a.retry': 'Could not save. Please try again.'");
    const again = findings(collect(fixed, 'client'));
    expect(again.zhPunctuation).toEqual([]);
    expect(again.zhSpacing).toEqual([]);
  });

  it('keeps numbers, times and paths half-width', () => {
    expect(RULES.zhPunctuation.test('时间 12:30')).toBe(false);
    expect(RULES.zhPunctuation.test('路径 a/b:c')).toBe(false);
    expect(RULES.zhSpacing.test('上传 3 个文件')).toBe(false);
  });

  it('blocks new findings and asks to shrink fixed ones', () => {
    const current = { zhPlease: ['client:zh.a.retry', 'client:zh.a.new'] };
    const baseline = { zhPlease: ['client:zh.a.retry', 'client:zh.a.gone'] };
    const { problems, stale } = compare(current, baseline);
    expect(problems).toEqual([
      'client:zh.a.new: drop 「请」 unless the reader must go outside the app (system settings, another computer, the browser) (docs/agents/ui-copy.md § Please and failures)',
    ]);
    expect(stale).toEqual(['zhPlease client:zh.a.gone']);
  });
});

describe('duplicateKeys', () => {
  it('rejects a top-level key that two dictionaries of one app both define', () => {
    const a =
      "export const en = { chat: { send: 'Send' } };\nexport const zh = { chat: { send: '发送' } };";
    const b = "export const en = { chat: { stop: 'Stop' }, voice: { mute: 'Mute' } };";
    expect(
      duplicateKeys([
        { name: 'mobile', file: 'a.ts', source: a },
        { name: 'mobile', file: 'b.ts', source: b },
        { name: 'client', file: 'c.ts', source: b },
      ]),
    ).toEqual(['duplicate key mobile:en.chat in a.ts and b.ts']);
  });
});

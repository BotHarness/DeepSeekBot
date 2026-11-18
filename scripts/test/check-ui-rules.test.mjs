import { describe, expect, it } from 'vitest';
import { compare, findings, isCopy, jsxCopy, pressables } from '../check-ui-rules.mjs';

const source = `
export function Panel({ name }) {
  return (
    <section aria-label="Recent activity" title={t('panel.title')}>
      <h2>最近活动</h2>
      <p>{'Nothing here yet'}</p>
      <p>{\`Open \${name} now\`}</p>
      <Icon name="search" />
      <span>{count}</span>
      <code>SOUL.md</code>
      <Button label={t('save')} placeholder="Type a name" />
      {t('panel.hint')}
      <button title={busy ? 'Please wait' : t('retry')} />
      {failed && 'Could not load'}
      <button title={busy && 'Still saving' || t('retry')} />
      {open ? 'Hide details' : '展开详情'}
      OK
    </section>
  );
}
`;

describe('check-ui-rules jsxCopy', () => {
  const found = jsxCopy(source, 'a.tsx');

  it('finds Chinese text, sentences in children and copy props', () => {
    expect(found.map(({ line, text }) => `${line} ${text}`)).toEqual([
      '4 Recent activity',
      '5 最近活动',
      '6 Nothing here yet',
      '7 Open {…} now',
      '11 Type a name',
      '13 Please wait',
      '14 Could not load',
      '15 Still saving',
      '16 Hide details',
      '16 展开详情',
    ]);
  });

  it('leaves single words, file names and t() calls alone', () => {
    expect(isCopy('OK')).toBe(false);
    expect(isCopy('SOUL.md')).toBe(false);
    expect(isCopy('search')).toBe(false);
    expect(isCopy('设置')).toBe(true);
  });

  it('blocks a new string and asks to shrink a fixed one', () => {
    const baseline = {
      jsxCopy: { 'a.tsx': ['Nothing here yet', 'Recent activity', 'Gone text'] },
    };
    const { problems, stale } = compare(found, baseline);
    expect(problems).toHaveLength(8);
    expect(problems[0]).toBe(
      'a.tsx:5 "最近活动": move visible text into locale.ts (Web) or strings.ts (mobile) (docs/agents/ui-copy.md § Where copy lives)',
    );
    expect(stale).toEqual(['jsxCopy a.tsx "Gone text"']);
  });

  it('counts repeated strings per file', () => {
    const twice = [
      { rule: 'jsxCopy', file: 'b.tsx', line: 1, text: 'Tobs Connect' },
      { rule: 'jsxCopy', file: 'b.tsx', line: 9, text: 'Tobs Connect' },
    ];
    expect(findings(twice)).toEqual({ jsxCopy: { 'b.tsx': ['Tobs Connect', 'Tobs Connect'] } });
    expect(compare(twice, { jsxCopy: { 'b.tsx': ['Tobs Connect'] } }).problems).toEqual([
      'b.tsx:9 "Tobs Connect": move visible text into locale.ts (Web) or strings.ts (mobile) (docs/agents/ui-copy.md § Where copy lives)',
    ]);
  });
});

describe('check-ui-rules pressables', () => {
  const screen = `
export function Row({ onPress, ...rest }) {
  return (
    <>
      <Pressable onPress={onPress} />
      <Pressable accessibilityLabel={strings.open} hitSlop={8} onPress={onPress} />
      <TouchableOpacity {...rest} />
    </>
  );
}
`;

  it('needs a label on every pressable and a touch target when the file never sizes one', () => {
    expect(pressables(screen, 'm.tsx').map(({ rule, line }) => `${line} ${rule}`)).toEqual([
      '5 pressableLabel',
      '5 touchTarget',
    ]);
  });

  it('accepts a file that sizes its pressables with theme.touch', () => {
    const sized = screen
      .replace('<>', '<View style={{ minHeight: theme.touch }}>')
      .replace('</>', '</View>');
    expect(pressables(sized, 'm.tsx').map(({ rule }) => rule)).toEqual(['pressableLabel']);
  });

  it('names the design rule in the error', () => {
    const { problems } = compare(pressables(screen, 'm.tsx'), {});
    expect(problems[0]).toBe(
      'm.tsx:5 "Pressable": give the pressable an accessibilityLabel from strings.ts (apps/mobile/DESIGN.md § Code rules 4)',
    );
  });
});

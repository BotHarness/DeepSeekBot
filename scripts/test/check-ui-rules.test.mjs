import { describe, expect, it } from 'vitest';
import { compare, findings, isCopy, jsxCopy } from '../check-ui-rules.mjs';

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
    expect(problems).toHaveLength(6);
    expect(problems[0]).toBe(
      'a.tsx:5 "最近活动": move visible text into locale.ts and read it with t() (docs/agents/ui-copy.md § Where copy lives)',
    );
    expect(stale).toEqual(['a.tsx "Gone text"']);
  });

  it('counts repeated strings per file', () => {
    const twice = [
      { file: 'b.tsx', line: 1, text: 'Tobs Connect' },
      { file: 'b.tsx', line: 9, text: 'Tobs Connect' },
    ];
    expect(findings(twice)).toEqual({ 'b.tsx': ['Tobs Connect', 'Tobs Connect'] });
    expect(compare(twice, { jsxCopy: { 'b.tsx': ['Tobs Connect'] } }).problems).toEqual([
      'b.tsx:9 "Tobs Connect": move visible text into locale.ts and read it with t() (docs/agents/ui-copy.md § Where copy lives)',
    ]);
  });
});

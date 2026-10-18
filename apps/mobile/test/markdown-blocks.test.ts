import { describe, expect, it } from 'vitest';

import { markdownBlocks } from '../src/ui/markdown-blocks';

describe('Android Markdown block boundaries', () => {
  it('keeps completed source and keys stable while only the tail changes', () => {
    const before = markdownBlocks('# Title\n\nFirst **paragraph**.\n\nNext');
    const after = markdownBlocks('# Title\n\nFirst **paragraph**.\n\nNext paragraph🙂');
    expect(before).toHaveLength(3);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]?.key).toBe(before[2]?.key);
    expect(after[2]?.source).toBe('Next paragraph🙂');
  });

  it.each([
    '  # Heading\n\ntext\n',
    'Paragraph\n\n- first\n\n  continued\n- second\n\nAfter',
    '```ts\nconst text = "a\\nb";\n\nmore\n```\n\nAfter',
    '| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter',
    '> quote\n>\n> paragraph\n\nAfter',
    'Setext\n---\n\nTrailing',
    '中文👨‍👩‍👧‍👦\r\n\r\n下一段',
  ])('preserves complete block structure and source: %s', (source) => {
    expect(
      markdownBlocks(source)
        .map((block) => block.source)
        .join(''),
    ).toBe(source.replace(/\r\n?/g, '\n'));
  });

  it('keeps document-wide references together rather than losing definitions', () => {
    const source = '[Read][ref]\n\nAnother paragraph.\n\n[ref]: https://example.com "Title"\n';
    expect(markdownBlocks(source)).toEqual([{ key: 0, source }]);
  });

  it('does not split open code, a table, or a loose list at internal blank lines', () => {
    expect(markdownBlocks('```\none\n\ntwo')).toHaveLength(1);
    expect(markdownBlocks('- one\n\n  continued\n- two')).toHaveLength(1);
    expect(markdownBlocks('| A | B |\n|---|---|\n| 1 | 2 |')).toHaveLength(1);
  });
});

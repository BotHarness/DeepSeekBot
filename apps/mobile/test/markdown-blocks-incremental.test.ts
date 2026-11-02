import { Lexer } from 'marked';
import { afterEach, expect, it, vi } from 'vitest';

import { createMarkdownBlocks, markdownBlocks } from '../src/ui/markdown-blocks';

afterEach(() => vi.restoreAllMocks());

it('relexes only the mutable suffix of a growing document and retains completed block identity', () => {
  const parse = createMarkdownBlocks();
  const prefix = '# Title\n\n' + 'Completed **paragraph**.\n\n'.repeat(100);
  const before = parse(prefix + 'Tail');
  const lex = vi.spyOn(Lexer, 'lex');
  const after = parse(prefix + 'Tail grows');
  expect(after).toEqual(markdownBlocks(prefix + 'Tail grows'));
  expect(lex.mock.calls[0]![0].length).toBeLessThan(100);
  expect(after[0]).toBe(before[0]);
  expect(after.at(-2)).toBe(before.at(-2));
  expect(after.at(-1)?.key).toBe(before.at(-1)?.key);
});

it.each([
  '# Heading\n\nText **bold** &amp; 👨‍👩‍👧‍👦.\n\nNext\n---\n\nend',
  'first\n\n- one\n\n  continued\n- two\n\nTail',
  'first\n\n```ts\nconst text = "a\\nb";\n\nmore\n```\n\nAfter',
  'first\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter',
  'first\n\n> quote\n>\n> paragraph\n\nAfter',
  '[Read][ref]\n\nParagraph\n\n[ref]: https://example.com "Title"\n\n[Read][ref]',
  'Before\n\n<div>\n\ninside\n</div>\n\nAfter',
  'Before\n\n<!--\n\ncomment\n-->\n\nAfter',
  'Before\n\n<custom-tag\n\nattribute="value"\n\n>\n\nAfter',
  'Before\n\n[reference]: <https://example.com>\r\n\r\n[reference]',
  'Before\n\n    code\n\n    more\n\nAfter',
  '中文\r\n\r\n尾部👨‍👩‍👧‍👦é\r\n\r\n下一段',
])('matches full-document parsing at every append boundary: %s', (source) => {
  const parse = createMarkdownBlocks();
  for (let end = 0; end <= source.length; end++) {
    const body = source.slice(0, end);
    expect(parse(body)).toEqual(markdownBlocks(body));
  }
});

it('invalidates cached boundaries on edits, truncation and document-wide reference definitions', () => {
  const parse = createMarkdownBlocks();
  const first = '# Title\n\n[Read][ref]\n\nTail';
  for (const source of [
    first,
    first + '\n\n[ref]: https://example.com',
    first,
    first.slice(0, 14),
    'Different\n\n## Heading\n\nText',
    '',
  ])
    expect(parse(source)).toEqual(markdownBlocks(source));
});

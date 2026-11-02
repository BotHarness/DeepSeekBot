import { Lexer, type Token } from 'marked';
import remend from 'remend';
import { afterEach, expect, it, vi } from 'vitest';

import { createMarkdownBlocks, markdownBlocks } from '../src/ui/markdown-blocks';
import { markdownBlockContent } from '../src/ui/markdown-block-content';

afterEach(() => vi.restoreAllMocks());
const shown = (tokens: Token[]) => tokens.filter((token) => token.type !== 'space');

it('uses the document parse for an unchanged active paragraph instead of lexing it twice', () => {
  const parse = createMarkdownBlocks();
  const lex = vi.spyOn(Lexer, 'lex');
  const blocks = parse('A long **completed** paragraph.');
  const result = markdownBlockContent(blocks[0]!, true);
  expect(lex).toHaveBeenCalledTimes(1);
  expect(shown(result.tokens)).toEqual(shown(Lexer.lex(result.markdown, { gfm: true })));
});

it.each([
  '中文 👨‍👩‍👧‍👦 é &amp; **strong** and _em_.\r\n\r\nNext',
  'Text\n---\n\n> quote\n>\n> paragraph\n\nTail',
  'first\n\n- one\n\n  continued\n- two\n\nTail',
  '[Read][ref]\n\nParagraph\n\n[ref]: https://example.com "Title"\n\n[Read][ref]',
  'first\n\n```ts\nconst s = "<&amp;>";\n\nmore\n```\n\nAfter',
  '| A | B |\n|---|---|\n| **1** | [two](https://example.com) |\n\nAfter',
  'Before\n\n<div>\n\ninside\n</div>\n\nAfter',
  'Before\n\n    code\n\n    more\n\nAfter',
  '\n\n[link](https://example.com) ~~delete~~ `code`  \nline',
])('matches the existing per-block repair and lexer at every append: %s', (source) => {
  const parse = createMarkdownBlocks();
  for (let end = 0; end <= source.length; end++) {
    const blocks = parse(source.slice(0, end));
    for (const [index, block] of blocks.entries()) {
      const active = index === blocks.length - 1;
      const result = markdownBlockContent(block, active);
      const expected = active ? remend(block.source) : block.source;
      expect(result.markdown).toBe(expected);
      expect(shown(result.tokens)).toEqual(shown(Lexer.lex(expected, { gfm: true })));
    }
  }
});

it('relexes a repaired tail and accepts source-only blocks without a cached parse', () => {
  const block = markdownBlocks('unfinished **bold')[0]!;
  const lex = vi.spyOn(Lexer, 'lex');
  const repaired = markdownBlockContent(block, true);
  expect(repaired.markdown).toBe('unfinished **bold**');
  expect(lex).toHaveBeenCalledTimes(1);
  expect(shown(repaired.tokens)).toEqual(shown(Lexer.lex(repaired.markdown, { gfm: true })));
  expect(markdownBlockContent({ key: 0, source: 'replacement' }, false).tokens).toEqual(
    Lexer.lex('replacement', { gfm: true }),
  );
});

it('does not reuse cached tokens after a caller replaces the source', () => {
  const block = markdownBlocks('first')[0]!;
  const replaced = { ...block, source: '**different**' };
  expect(shown(markdownBlockContent(replaced, false).tokens)).toEqual(
    shown(Lexer.lex(replaced.source, { gfm: true })),
  );
});

it('keeps the final paragraph after a growing long code block and table', () => {
  const source =
    '# 格式验收\n\n中文 **加粗** &amp; 👨‍👩‍👧‍👦。\n\n```ts\n' +
    Array.from({ length: 120 }, (_, i) => `const row${i} = "中文<&amp;>🙂";`).join('\n') +
    '\n```\n\n| 项目 | 值 |\n|---|---|\n' +
    Array.from({ length: 40 }, (_, i) => `| 第 ${i + 1} 行 | **稳定** |\n`).join('') +
    '\n最后一段：REPLAY_COMPLETE。\n';
  const parse = createMarkdownBlocks();
  for (let end = 0; end < source.length + 17; end += 17) {
    const blocks = parse(source.slice(0, end));
    expect(blocks).toEqual(markdownBlocks(source.slice(0, end)));
    for (const [index, block] of blocks.entries()) {
      const result = markdownBlockContent(block, index === blocks.length - 1);
      expect(shown(result.tokens)).toEqual(shown(Lexer.lex(result.markdown, { gfm: true })));
    }
  }
  expect(parse(source).at(-1)?.parsed?.tokens[0]).toMatchObject({
    type: 'paragraph',
    text: '最后一段：REPLAY_COMPLETE。',
  });
});

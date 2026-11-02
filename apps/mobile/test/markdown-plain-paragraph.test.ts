import { Lexer } from 'marked';
import { afterEach, expect, it, vi } from 'vitest';

import { createMarkdownBlocks } from '../src/ui/markdown-blocks';

afterEach(() => vi.restoreAllMocks());

it('does not repeatedly lex the full growing plain paragraph', () => {
  const parse = createMarkdownBlocks();
  const text = 'Readable words, 中文、カナ and café with punctuation! '.repeat(100);
  const expected = Lexer.lex(text, { gfm: true });
  const lex = vi.spyOn(Lexer, 'lex');
  for (let end = 32; end < text.length; end += 32) parse(text.slice(0, end));
  const blocks = parse(text);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]?.parsed?.tokens).toEqual([...expected]);
  expect(lex).not.toHaveBeenCalled();
});

it.each([
  'Readable text with commas, periods. Questions? Exclamations! (parentheses) / slash; quotes "and\'".',
  '中文、カナ、한글 العربية café 👨‍👩‍👧‍👦 🧑🏽‍💻! \u00a0\u2028\u2029',
  'plain **strong** _em_ ~~del~~ `code` \\*literal* &amp; &#65; &#x1f642;',
  'plain [label][ref]\n\n[ref]: https://example.com',
  'plain www.example.com and HTTPS://example.com and name@example.com',
  'plain mailto:name@example.com and xmpp:name@example.com/path',
  'plain <https://example.com> <b>HTML</b> ![image](url)',
  'plain\n---\n\n# Heading\n\n> quote\n\n- list\n\n    code',
  'plain\n\n| A | B |\n|---|---|\n| one | two |',
  'plain  \nline\r\nnext\rtail\tmore',
  '  leading\n\n   # heading\n\n1. ordered\n\n```js\ncode\n```',
])('matches the full lexer at every append boundary: %s', (text) => {
  const parse = createMarkdownBlocks();
  for (let end = 0; end <= text.length; end++) {
    const source = text.slice(0, end);
    const blocks = parse(source);
    const expected = Lexer.lex(source, { gfm: true });
    if (expected.length === 1 && expected[0]?.type === 'paragraph') {
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.parsed?.tokens).toEqual([...expected]);
    }
  }
});

it('invalidates the plain classification on replacement, truncation, and special characters', () => {
  const parse = createMarkdownBlocks();
  for (const source of [
    'Plain text',
    'Plain **text**',
    'Plain text',
    'Plain',
    'www.example.com',
    'Plain text',
    '',
    '# Title',
  ]) {
    const blocks = parse(source);
    expect(blocks.flatMap((block) => block.parsed?.tokens ?? [])).toEqual([
      ...Lexer.lex(source, { gfm: true }),
    ]);
  }
});

it('matches the lexer for every ASCII character in a plain paragraph', () => {
  for (let code = 0; code < 128; code++) {
    const character = String.fromCharCode(code);
    for (const source of [
      `Plain${character}text`,
      `${character}Plain`,
      `Plain${character}`,
      `Plain${character.repeat(4)}text`,
    ]) {
      const expected = Lexer.lex(source, { gfm: true });
      const blocks = createMarkdownBlocks()(source);
      if (expected.length === 1 && expected[0]?.type === 'paragraph')
        expect(blocks[0]?.parsed?.tokens).toEqual([...expected]);
    }
  }
});

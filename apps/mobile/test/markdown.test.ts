import { describe, expect, it } from 'vitest';

import { inlineText, parseInline, parseMarkdown } from '../src/ui/markdown';

describe('Markdown reader', () => {
  it('reads the blocks a PersonaBot reply uses', () => {
    const blocks = parseMarkdown(
      [
        '# Plan',
        '',
        'First **bold** and `code`.',
        'Second line.',
        '',
        '- one',
        '- two',
        '  - nested',
        '',
        '1. first',
        '2. second',
        '',
        '```ts',
        'const a = 1;',
        '',
        'const b = 2;',
        '```',
        '',
        '> quoted',
        '',
        '| a | b |',
        '| - | - |',
        '',
        '---',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'code',
      'quote',
      'table',
      'rule',
    ]);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'First ' },
        { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
        { type: 'text', text: ' and ' },
        { type: 'code', text: 'code' },
        { type: 'text', text: '.' },
        { type: 'break' },
        { type: 'text', text: 'Second line.' },
      ],
    });
    const bullets = blocks[2] as Extract<(typeof blocks)[number], { type: 'list' }>;
    expect(bullets.ordered).toBe(false);
    expect(bullets.items).toHaveLength(2);
    expect(bullets.items[1]!.map((block) => block.type)).toEqual(['paragraph', 'list']);
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true, start: 1 });
    expect(blocks[4]).toEqual({
      type: 'code',
      language: 'ts',
      text: 'const a = 1;\n\nconst b = 2;',
    });
  });

  it('links only http, https and mailto targets', () => {
    expect(parseInline('see [docs](https://botharness.ai) now')).toContainEqual({
      type: 'link',
      href: 'https://botharness.ai',
      children: [{ type: 'text', text: 'docs' }],
    });
    expect(parseInline('[x](javascript:alert(1))')).not.toContainEqual(
      expect.objectContaining({ type: 'link' }),
    );
    expect(parseInline('at https://example.com/a.')).toEqual([
      { type: 'text', text: 'at ' },
      {
        type: 'link',
        href: 'https://example.com/a',
        children: [{ type: 'text', text: 'https://example.com/a' }],
      },
      { type: 'text', text: '.' },
    ]);
  });

  it('keeps unmatched markers and intraword underscores as text', () => {
    expect(inlineText(parseInline('a * b and snake_case_name'))).toBe('a * b and snake_case_name');
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }]);
    expect(parseInline('*em* and ~~gone~~')).toEqual([
      { type: 'em', children: [{ type: 'text', text: 'em' }] },
      { type: 'text', text: ' and ' },
      { type: 'del', children: [{ type: 'text', text: 'gone' }] },
    ]);
    expect(parseMarkdown('```\nunterminated')).toEqual([{ type: 'code', text: 'unterminated' }]);
  });
});

import { describe, expect, it } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import type { ChatRow } from '../src/ui/chat/message-groups';
import { nativeMarkdown, nativeTextRow, plainText } from '../src/ui/chat/native-text-row';

const message = (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: 'm1',
  at: '2026-11-11T01:02:00.000Z',
  author: 'bot',
  body: 'Plain reply about the history window.',
  attachments: [],
  delivery: 'committed',
  ...overrides,
});

const row = (overrides: Partial<ConversationMessage> = {}): ChatRow => ({
  kind: 'message',
  key: overrides.id ?? 'm1',
  message: message(overrides),
  first: true,
  last: false,
});

const context = { dm: true, selecting: false, latest: 'latest', reading: new Map() };

describe('native text rows', () => {
  it('describes a committed plain DM message with its grouping and time', () => {
    const native = nativeTextRow(row(), context);
    expect(native).toMatchObject({
      key: 'm1',
      human: false,
      first: true,
      last: false,
      body: 'Plain reply about the history window.',
    });
    expect(native?.time).toMatch(/\d/);
  });

  it('adds the delivered check to the Human time', () => {
    expect(nativeTextRow(row({ author: 'human' }), context)?.time.endsWith(' ✓')).toBe(true);
  });

  it('keeps every live or decorated message on React rows', () => {
    const decorated: Partial<ConversationMessage>[] = [
      { id: 'latest' },
      { delivery: 'pending', author: 'human' },
      { attachments: [{ kind: 'image' } as never] },
      { replyTo: 'm0' },
      { reactions: [{ emoji: '👍' } as never] },
      { mentions: [{} as never] },
      { card: {} as never },
      { activity: {} as never },
      { author: 'system' },
      { body: '**bold** reply' },
      { body: 'Markdown joins\nthese lines' },
    ];
    for (const overrides of decorated)
      expect(nativeTextRow(row(overrides), context)).toBeUndefined();
    expect(nativeTextRow(row(), { ...context, dm: false })).toBeUndefined();
    expect(nativeTextRow(row(), { ...context, selecting: true })).toBeUndefined();
    expect(nativeTextRow(row(), { ...context, reading: new Map([['m1', []]]) })).toBeUndefined();
  });

  it('accepts only text without Markdown syntax or links', () => {
    expect(plainText('收到，需要我做什么？')).toBe(true);
    expect(plainText('Line one\nline two')).toBe(true);
    for (const body of [
      '`code`',
      '# Title',
      '- item',
      '1. item',
      '> quote',
      '| a |',
      'see https://x.y',
      '  ',
      '[link](x)',
    ])
      expect(plainText(body)).toBe(false);
  });

  it('routes bot Markdown through the native Markdown renderer when enabled', () => {
    const markdown = { ...context, markdown: true };
    const bold = nativeTextRow(row({ body: '**bold** and `code`\nsoft break' }), markdown);
    expect(bold).toMatchObject({ markdown: true, body: '**bold** and `code`\nsoft break' });
    expect(
      nativeTextRow(row({ author: 'human', body: '**not markdown**' }), markdown),
    ).toBeUndefined();
    expect(nativeTextRow(row({ author: 'human', body: 'plain' }), markdown)?.markdown).toBe(false);
    expect(nativeTextRow(row({ body: 'plain' }), context)?.markdown).toBe(false);
  });

  it('keeps tables, images, links, HTML and math on React rows', () => {
    expect(nativeMarkdown('- one\n- two\n\n> quote\n\n```ts\nconst a = 1;\n```')).toBe(true);
    for (const body of [
      '| a | b |\n| --- | --- |',
      '![x](y.png)',
      '[docs](https://x.y)',
      'see www.x.y',
      '<b>x</b>',
      '$x$',
    ])
      expect(nativeMarkdown(body)).toBe(false);
  });
});

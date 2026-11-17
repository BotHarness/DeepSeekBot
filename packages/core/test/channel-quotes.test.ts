import { describe, expect, it } from 'vitest';

import {
  assertQuoteTargets,
  ChannelQuoteError,
  durableQuotes,
  parseQuotesInput,
  projectQuotes,
  quotePromptBlock,
  quoteTextMatches,
  referencedIds,
  sameQuoteIntent,
} from '../src/channels/quotes.js';
import { isChannelMessage } from '../src/channels/channel.js';

describe('Channel quotes', () => {
  it('parses whole and partial quotes and refuses malformed input', () => {
    expect(parseQuotesInput(undefined)).toEqual([]);
    expect(parseQuotesInput([{ messageId: 'a' }, { messageId: 'b', text: '  part  ' }])).toEqual([
      { messageId: 'a' },
      { messageId: 'b', text: 'part' },
    ]);
    expect(
      parseQuotesInput([
        { messageId: 'a', note: '  ok  ' },
        { messageId: 'b', note: ' ' },
      ]),
    ).toEqual([{ messageId: 'a', note: 'ok' }, { messageId: 'b' }]);
    expect(parseQuotesInput([{ messageId: 'a', note: 3 }])).toBeTypeOf('string');
    expect(parseQuotesInput('a')).toBeTypeOf('string');
    expect(parseQuotesInput([{ messageId: '' }])).toBeTypeOf('string');
    expect(parseQuotesInput([{ messageId: 'a', text: ' ' }])).toBeTypeOf('string');
    expect(parseQuotesInput([{ messageId: 'a' }, { messageId: 'a' }])).toBeTypeOf('string');
    expect(parseQuotesInput([{ messageId: 'a', text: 'x'.repeat(1001) }])).toBeTypeOf('string');
  });

  it('matches a rendered selection against its Markdown source', () => {
    const body =
      'See [the guide](https://example.com) and **ship** it.\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    expect(quoteTextMatches(body, 'the guide and ship it')).toBe(true);
    expect(quoteTextMatches(body, 'a\tb\n1\t2')).toBe(true);
    expect(quoteTextMatches(body, 'ship it today')).toBe(false);
    expect(quoteTextMatches('引用这一段话。然后继续', '这一段话')).toBe(true);
  });

  it('refuses a missing target or an excerpt that is not in it', () => {
    const lookup = (id: string) => (id === 'a' ? { body: 'alpha beta' } : undefined);
    expect(() => assertQuoteTargets([{ messageId: 'a', text: 'beta' }], lookup)).not.toThrow();
    expect(() => assertQuoteTargets([{ messageId: 'b' }], lookup)).toThrow(ChannelQuoteError);
    expect(() => assertQuoteTargets([{ messageId: 'a', text: 'gamma' }], lookup)).toThrow(
      'Quote text is not part of message a',
    );
  });

  it('refuses more than eight quotes before a store writes them', () => {
    const lookup = (id: string) => ({ body: id });
    const quotes = Array.from({ length: 9 }, (_, index) => ({ messageId: `m${index}` }));
    expect(() => assertQuoteTargets(quotes.slice(0, 8), lookup)).not.toThrow();
    expect(() => assertQuoteTargets(quotes, lookup)).toThrow('At most 8 quotes are supported');
  });

  it('matches an excerpt against the text a reader sees for entity references', () => {
    expect(quoteTextMatches('Fish &amp; chips', 'Fish & chips')).toBe(true);
    expect(quoteTextMatches('Un &#233;t&#xE9; chaud', 'été chaud')).toBe(true);
    expect(quoteTextMatches('Un &eacute;t&eacute; chaud', 'été chaud')).toBe(true);
    expect(quoteTextMatches('&Eacute;cole &copy; 2026', 'École © 2026')).toBe(true);
    expect(quoteTextMatches('Fish &amp; chips', 'Fish & fries')).toBe(false);
  });

  it('projects previews and hides the excerpt of a message that is gone', () => {
    const author = { kind: 'human' as const };
    const projected = projectQuotes(
      {
        quotes: [
          { messageId: 'a', text: 'beta' },
          { messageId: 'gone', text: 'secret' },
        ],
      },
      (id) => (id === 'a' ? { author, body: 'alpha beta' } : undefined),
    );
    expect(projected.quotes).toEqual([
      { messageId: 'a', text: 'beta', preview: { author, body: 'alpha beta' } },
      { messageId: 'gone', preview: null },
    ]);
  });

  it('names reply and quote targets once and validates the durable shape', () => {
    expect(
      referencedIds({
        replyTo: 'a',
        quotes: [{ messageId: 'a' }, { messageId: 'b' }],
      }),
    ).toEqual(['a', 'b']);
    const message = {
      id: 'm',
      at: '2026-11-17T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'x',
    };
    expect(isChannelMessage({ ...message, quotes: [{ messageId: 'a', text: 'b' }] })).toBe(true);
    expect(isChannelMessage({ ...message, quotes: [] })).toBe(false);
    expect(isChannelMessage({ ...message, quotes: [{ text: 'b' }] })).toBe(false);
  });

  it('tells the Bot what each quote cites', () => {
    const block = quotePromptBlock(
      [{ messageId: 'a', text: 'beta' }, { messageId: 'b' }, { messageId: 'gone' }],
      (id) =>
        id === 'a'
          ? { author: 'Human', body: 'alpha beta' }
          : id === 'b'
            ? { author: 'PersonaBot ada', body: 'whole\nmessage' }
            : undefined,
    );
    expect(block).toContain('- Message a from Human (excerpt): "beta"');
    expect(block).toContain('- Message b from PersonaBot ada: "whole message"');
    expect(block).toContain('- Message gone: (unavailable)');
    expect(quotePromptBlock(undefined, () => undefined)).toBe('');
    expect(
      quotePromptBlock([{ messageId: 'a', text: 'beta', note: 'Agreed' }], () => ({
        author: 'Human',
        body: 'alpha beta',
      })),
    ).toContain('(excerpt): "beta"\n  Sender\'s reply to this quote: "Agreed"');
  });

  it('keeps symbol-only excerpts, drops empty lists and hides purged targets', () => {
    expect(quoteTextMatches('price: $$$ !!!', '$$$')).toBe(true);
    expect(quoteTextMatches('price: 10', '$$$')).toBe(false);
    expect(durableQuotes({ id: 'm', quotes: [] })).toEqual({ id: 'm' });
    const purgedTarget = {
      author: 'Ada',
      body: 'secret',
      contentPurge: { at: 'now' },
    };
    expect(quotePromptBlock([{ messageId: 'a' }], () => purgedTarget)).toContain('(unavailable)');
    expect(
      projectQuotes({ quotes: [{ messageId: 'a', text: 'secret' }] }, () => ({
        author: { kind: 'human' as const },
        body: 'secret',
        contentPurge: { at: 'now' },
      })).quotes,
    ).toEqual([{ messageId: 'a', preview: null }]);
  });

  it('treats a retried send with the same quotes as the same intent', () => {
    expect(sameQuoteIntent([{ messageId: 'a', text: 'x' }], [{ messageId: 'a', text: 'x' }])).toBe(
      true,
    );
    expect(sameQuoteIntent([{ messageId: 'a' }], [{ messageId: 'a', text: 'x' }])).toBe(false);
    expect(sameQuoteIntent([{ messageId: 'a', text: 'x' }], [{ messageId: 'a', text: 'y' }])).toBe(
      false,
    );
    expect(sameQuoteIntent(undefined, [])).toBe(true);
    expect(sameQuoteIntent([{ messageId: 'a' }], [{ messageId: 'b' }])).toBe(false);
  });
});

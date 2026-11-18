import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  durableQuotes,
  MAX_CHANNEL_QUOTES,
  MAX_QUOTE_TEXT,
  parseQuotesInput,
  quoteTextMatches,
  referencedIds,
  sameQuoteIntent,
  type ChannelQuote,
} from '../src/channels/quotes.js';

const messageId = fc.stringMatching(/^[a-z0-9-]{1,12}$/u);
const excerpt = fc.string({ minLength: 1, maxLength: 40 }).filter((text) => text.trim() !== '');
const quote: fc.Arbitrary<ChannelQuote> = fc.record(
  { messageId, text: excerpt, note: excerpt },
  { requiredKeys: ['messageId'] },
);
const quoteList = fc.uniqueArray(quote, {
  maxLength: MAX_CHANNEL_QUOTES,
  selector: (item) => `${item.messageId}\u0000${item.text?.trim() ?? ''}`,
});

describe('Channel quote rules', () => {
  it('trims excerpts and notes and keeps the order of a valid list', () => {
    fc.assert(
      fc.property(quoteList, (quotes) => {
        const parsed = parseQuotesInput(quotes);
        expect(parsed).toEqual(
          quotes.map(({ messageId: id, text, note }) => ({
            messageId: id,
            ...(text === undefined ? {} : { text: text.trim() }),
            ...(note === undefined ? {} : { note: note.trim() }),
          })),
        );
      }),
    );
  });

  it('refuses a list with the same quote twice', () => {
    fc.assert(
      fc.property(
        quoteList.filter((quotes) => quotes.length > 0),
        fc.nat(),
        (quotes, pick) => {
          const repeated = quotes[pick % quotes.length]!;
          const doubled = [...quotes, { ...repeated, text: repeated.text && ` ${repeated.text} ` }];
          fc.pre(doubled.length <= MAX_CHANNEL_QUOTES);
          expect(parseQuotesInput(doubled)).toBeTypeOf('string');
        },
      ),
    );
  });

  it('refuses lists over the limit and excerpts over the length limit', () => {
    fc.assert(
      fc.property(
        fc.array(quote, { minLength: MAX_CHANNEL_QUOTES + 1, maxLength: MAX_CHANNEL_QUOTES + 4 }),
        fc.integer({ min: MAX_QUOTE_TEXT + 1, max: MAX_QUOTE_TEXT + 50 }),
        messageId,
        (quotes, length, id) => {
          expect(parseQuotesInput(quotes)).toBeTypeOf('string');
          expect(parseQuotesInput([{ messageId: id, text: 'x'.repeat(length) }])).toBeTypeOf(
            'string',
          );
        },
      ),
    );
  });

  it('lists each referenced message once, reply target first', () => {
    fc.assert(
      fc.property(fc.option(messageId, { nil: undefined }), quoteList, (replyTo, quotes) => {
        const ids = referencedIds({ ...(replyTo === undefined ? {} : { replyTo }), quotes });
        expect(ids).toEqual([
          ...new Set([
            ...(replyTo === undefined ? [] : [replyTo]),
            ...quotes.map((q) => q.messageId),
          ]),
        ]);
      }),
    );
  });

  it('treats intent as equal exactly when id, excerpt and note all match', () => {
    fc.assert(
      fc.property(quoteList, quoteList, (left, right) => {
        const same =
          left.length === right.length &&
          left.every(
            (item, index) =>
              item.messageId === right[index]!.messageId &&
              item.text === right[index]!.text &&
              item.note === right[index]!.note,
          );
        expect(sameQuoteIntent(left, right)).toBe(same);
        expect(sameQuoteIntent(left, left)).toBe(true);
        expect(sameQuoteIntent(left, durableQuotes({ quotes: left }).quotes)).toBe(true);
      }),
    );
  });

  it('matches every excerpt taken from the body', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 80 }), fc.nat(), fc.nat(), (body, a, b) => {
        const start = a % body.length;
        const text = body.slice(start, start + 1 + (b % (body.length - start)));
        fc.pre(text.trim() !== '');
        expect(quoteTextMatches(body, text)).toBe(true);
      }),
    );
  });
});

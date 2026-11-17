import { decodeNamedCharacterReference } from 'decode-named-character-reference';
import {
  replyPreviewOf,
  type ChannelReplyPreview,
  type ReplyPreviewSource,
} from './reply-preview.js';

export const MAX_CHANNEL_QUOTES = 8;
export const MAX_QUOTE_TEXT = 1000;

export interface ChannelQuote<Preview = ChannelReplyPreview> {
  messageId: string;
  text?: string;
  note?: string;
  preview?: Preview | null;
}

export class ChannelQuoteError extends Error {
  constructor(
    readonly code:
      | 'invalid-quotes'
      | 'unsupported-quotes'
      | 'quote-target-missing'
      | 'quote-text-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'ChannelQuoteError';
  }
}

export function parseQuotesInput(raw: unknown): ChannelQuote[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return 'quotes must be a list';
  if (raw.length > MAX_CHANNEL_QUOTES) return `At most ${MAX_CHANNEL_QUOTES} quotes are supported`;
  const quotes: ChannelQuote[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return 'Each quote names a messageId';
    const record = item as Record<string, unknown>;
    const messageId = record['messageId'];
    const text = record['text'];
    const rawNote = record['note'];
    if (rawNote !== undefined && typeof rawNote !== 'string') return 'Quote note must be text';
    const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : undefined;
    if (note !== undefined && Array.from(note).length > MAX_QUOTE_TEXT)
      return `Quote note is limited to ${MAX_QUOTE_TEXT} characters`;
    if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 200)
      return 'Each quote names a messageId';
    if (text !== undefined && (typeof text !== 'string' || !text.trim()))
      return 'Quote text must be a non-empty excerpt';
    if (typeof text === 'string' && Array.from(text).length > MAX_QUOTE_TEXT)
      return `Quote text is limited to ${MAX_QUOTE_TEXT} characters`;
    const excerpt = typeof text === 'string' ? text.trim() : undefined;
    if (quotes.some((quote) => quote.messageId === messageId && quote.text === excerpt))
      return 'The same quote appears twice';
    quotes.push({
      messageId,
      ...(excerpt === undefined ? {} : { text: excerpt }),
      ...(note === undefined ? {} : { note }),
    });
  }
  return quotes;
}

export function isChannelQuoteList(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHANNEL_QUOTES)
    return false;
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Record<string, unknown>;
    if (typeof record['messageId'] !== 'string' || record['messageId'].length === 0) return false;
    if (record['text'] !== undefined && typeof record['text'] !== 'string') return false;
    if (record['note'] !== undefined && typeof record['note'] !== 'string') return false;
    const preview = record['preview'];
    return (
      preview === undefined ||
      preview === null ||
      (typeof preview === 'object' &&
        typeof (preview as Record<string, unknown>)['body'] === 'string')
    );
  });
}

function comparable(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/giu, (whole, name: string) => {
    if (!name.startsWith('#')) return decodeNamedCharacterReference(name) || whole;
    const code = /^#x/iu.test(name)
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function bodyMatches(body: string, text: string): boolean {
  const needle = comparable(text);
  if (needle.length === 0) return body.includes(text.trim());
  return (
    comparable(body.replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/gu, ']')).includes(needle) ||
    comparable(body).includes(needle)
  );
}

export function quoteTextMatches(body: string, text: string): boolean {
  return bodyMatches(body, text) || bodyMatches(decodeEntities(body), text);
}

function purged(target: object): boolean {
  return (target as { contentPurge?: unknown }).contentPurge !== undefined;
}

export function assertQuoteTargets(
  quotes: readonly ChannelQuote[] | undefined,
  lookup: (messageId: string) => { body: string } | undefined,
): void {
  if ((quotes?.length ?? 0) > MAX_CHANNEL_QUOTES)
    throw new ChannelQuoteError(
      'invalid-quotes',
      `At most ${MAX_CHANNEL_QUOTES} quotes are supported`,
    );
  for (const quote of quotes ?? []) {
    const target = lookup(quote.messageId);
    if (target === undefined)
      throw new ChannelQuoteError(
        'quote-target-missing',
        `Quoted message ${quote.messageId} must exist in this Channel`,
      );
    if (quote.text !== undefined && !quoteTextMatches(target.body, quote.text))
      throw new ChannelQuoteError(
        'quote-text-mismatch',
        `Quote text is not part of message ${quote.messageId}`,
      );
  }
}

export function sameQuoteIntent(
  left: readonly ChannelQuote<unknown>[] | undefined,
  right: readonly ChannelQuote<unknown>[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return (
    a.length === b.length &&
    a.every((quote, index) => {
      const other = b[index]!;
      return (
        quote.messageId === other.messageId &&
        quote.text === other.text &&
        quote.note === other.note
      );
    })
  );
}

export function quoteIds(message: { quotes?: readonly ChannelQuote<unknown>[] }): string[] {
  return (message.quotes ?? []).map((quote) => quote.messageId);
}

export function referencedIds(message: {
  replyTo?: string;
  quotes?: readonly ChannelQuote<unknown>[];
}): string[] {
  return [
    ...new Set([...(message.replyTo === undefined ? [] : [message.replyTo]), ...quoteIds(message)]),
  ];
}

export function durableQuotes<T extends { quotes?: ChannelQuote[] }>(message: T): T {
  if (message.quotes === undefined) return message;
  if (message.quotes.length === 0) {
    const rest = { ...message };
    delete rest.quotes;
    return rest;
  }
  return {
    ...message,
    quotes: message.quotes.map(({ messageId, text, note }) => ({
      messageId,
      ...(text === undefined ? {} : { text }),
      ...(note === undefined ? {} : { note }),
    })),
  };
}

export function projectQuotes<
  Ref extends { name: string; mime: string },
  M extends { quotes?: ChannelQuote<ChannelReplyPreview<Ref>>[] },
>(
  message: M,
  lookup: (messageId: string) => ReplyPreviewSource<Ref> | undefined,
  projectThumbnail?: (target: ReplyPreviewSource<Ref>, ref: Ref) => Ref,
): M {
  if (message.quotes === undefined) return message;
  return {
    ...message,
    quotes: message.quotes.map(({ messageId, text, note }) => {
      const target = lookup(messageId);
      if (target === undefined || purged(target))
        return { messageId, ...(note === undefined ? {} : { note }), preview: null };
      return {
        messageId,
        ...(text === undefined ? {} : { text }),
        ...(note === undefined ? {} : { note }),
        preview: replyPreviewOf(
          target,
          projectThumbnail === undefined ? undefined : (ref) => projectThumbnail(target, ref),
        ),
      };
    }),
  };
}

const PROMPT_QUOTE_LIMIT = 600;

export function quotePromptBlock(
  quotes: readonly ChannelQuote<unknown>[] | undefined,
  lookup: (messageId: string) => { author: string; body: string } | undefined,
): string {
  if (quotes === undefined || quotes.length === 0) return '';
  const lines = quotes.map((quote) => {
    const target = lookup(quote.messageId);
    const note =
      quote.note === undefined
        ? ''
        : `\n  Sender's reply to this quote: ${JSON.stringify(quote.note)}`;
    if (target === undefined || purged(target))
      return `- Message ${quote.messageId}: (unavailable)${note}`;
    const source = quote.text ?? target.body;
    const characters = Array.from(source.replace(/\s+/gu, ' ').trim());
    const excerpt =
      characters.length > PROMPT_QUOTE_LIMIT
        ? characters.slice(0, PROMPT_QUOTE_LIMIT).join('') + '...'
        : characters.join('');
    return `- Message ${quote.messageId} from ${target.author}${quote.text === undefined ? '' : ' (excerpt)'}: ${JSON.stringify(excerpt)}${note}`;
  });
  return `\n[Quoted messages: the sender cites these earlier messages of this Channel, some with a reply to that quote; answer with them in mind]\n${lines.join('\n')}`;
}

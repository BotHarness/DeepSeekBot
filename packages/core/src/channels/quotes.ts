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
  preview?: Preview | null;
}

export class ChannelQuoteError extends Error {
  constructor(
    readonly code: 'invalid-quotes' | 'quote-target-missing' | 'quote-text-mismatch',
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
    if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 200)
      return 'Each quote names a messageId';
    if (text !== undefined && (typeof text !== 'string' || !text.trim()))
      return 'Quote text must be a non-empty excerpt';
    if (typeof text === 'string' && Array.from(text).length > MAX_QUOTE_TEXT)
      return `Quote text is limited to ${MAX_QUOTE_TEXT} characters`;
    const excerpt = typeof text === 'string' ? text.trim() : undefined;
    if (quotes.some((quote) => quote.messageId === messageId && quote.text === excerpt))
      return 'The same quote appears twice';
    quotes.push(excerpt === undefined ? { messageId } : { messageId, text: excerpt });
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

export function quoteTextMatches(body: string, text: string): boolean {
  const needle = comparable(text);
  return (
    needle.length === 0 ||
    comparable(body.replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/gu, ']')).includes(needle) ||
    comparable(body).includes(needle)
  );
}

export function assertQuoteTargets(
  quotes: readonly ChannelQuote[] | undefined,
  lookup: (messageId: string) => { body: string } | undefined,
): void {
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
  return {
    ...message,
    quotes: message.quotes.map(({ messageId, text }) =>
      text === undefined ? { messageId } : { messageId, text },
    ),
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
    quotes: message.quotes.map(({ messageId, text }) => {
      const target = lookup(messageId);
      if (target === undefined) return { messageId, preview: null };
      return {
        messageId,
        ...(text === undefined ? {} : { text }),
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
    if (target === undefined) return `- Message ${quote.messageId}: (unavailable)`;
    const source = quote.text ?? target.body;
    const characters = Array.from(source.replace(/\s+/gu, ' ').trim());
    const excerpt =
      characters.length > PROMPT_QUOTE_LIMIT
        ? characters.slice(0, PROMPT_QUOTE_LIMIT).join('') + '...'
        : characters.join('');
    return `- Message ${quote.messageId} from ${target.author}${quote.text === undefined ? '' : ' (excerpt)'}: ${JSON.stringify(excerpt)}`;
  });
  return `\n[Quoted messages: the sender cites these earlier messages of this Channel; answer with them in mind]\n${lines.join('\n')}`;
}

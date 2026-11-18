import type { ReactElement } from 'react';

import type { ComposerQuote } from './composer-draft-store.js';
import type { BotHarnessTranslate } from './locale.js';
import { MessageSelectionToolbar } from './message-selection-toolbar.js';

export function quoteSourceId(sessionId: string, key: string): string {
  return `session:${sessionId}:${key}`;
}

function quoteExcerpt(text: string): string {
  return Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, 140).join('');
}

export function quotedRequest(quotes: readonly ComposerQuote[], message: string): string {
  return [
    ...quotes.map((quote) => {
      const cited = (quote.text ?? '')
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n');
      const note = quote.note?.trim() ?? '';
      return note === '' ? cited : `${cited}\n\n↳ ${note}`;
    }),
    message,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

export function SessionQuoteToolbar({
  sessionId,
  enabled,
  t,
  authorOf,
  onQuote,
}: {
  readonly sessionId: string;
  readonly enabled: boolean;
  readonly t: BotHarnessTranslate;
  readonly authorOf: (source: string) => string;
  readonly onQuote: (quote: ComposerQuote) => void;
}): ReactElement {
  return (
    <MessageSelectionToolbar
      enabled={enabled}
      label={t('message.quoteSelection')}
      quoteLabel={t('message.quote')}
      canQuote={(source) => source.startsWith(quoteSourceId(sessionId, ''))}
      onQuote={(source, text) =>
        onQuote({ messageId: source, text, author: authorOf(source), excerpt: quoteExcerpt(text) })
      }
    />
  );
}

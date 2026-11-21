import { QuoteCard, QuoteCardList } from '../../ds/quote-chip.js';
import type { ReactElement } from 'react';
import { botNameSource, paintBotName } from '../../bot-primary-color.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { toolApprovalReplyPreview } from '../../approval-text.js';
import type { BotSummary, ChannelMessage, ChannelSummary } from '../../store.js';
import { ReplyQuoteThumb, replyQuoteText } from '../../reply-quote-media.js';
import { authorLabel } from './message-labels.js';

export function QuoteList({
  humans,
  message,
  channelId,
  bots,
  onJump,
  t,
}: {
  message: ChannelMessage;
  channelId: string | undefined;
  bots: readonly BotSummary[];
  humans: Pick<ChannelSummary, 'humanMembers'>;
  onJump(messageId: string): void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const quotes = message.quotes ?? [];
  const replyTo = message.replyTo;
  const reply =
    replyTo === undefined ||
    quotes.some((quote) => quote.messageId === replyTo && quote.text === undefined)
      ? []
      : [{ messageId: replyTo, preview: message.replyToPreview, reply: true }];
  const entries = [...reply, ...quotes.map((quote) => ({ ...quote, reply: false }))];
  if (entries.length === 0) return null;
  const mine = message.author.kind === 'human';
  return (
    <QuoteCardList label={t('message.quotes')}>
      {entries.map((entry, index) => {
        const key = `${entry.messageId}:${index}`;
        const preview = entry.preview;
        const text = 'text' in entry ? entry.text : undefined;
        const note = 'note' in entry ? entry.note : undefined;
        if (preview === undefined || preview === null)
          return (
            <QuoteCard
              key={key}
              body={t('message.replyUnavailable')}
              part={false}
              mine={mine}
              kind="unavailable"
              note={note}
            />
          );
        const quoted = preview.author;
        const author = authorLabel({ ...message, author: quoted }, bots, t, humans);
        const colorSource =
          mine || quoted.kind !== 'bot'
            ? undefined
            : botNameSource(bots.find((bot) => bot.slug === quoted.slug));
        const media = preview.media;
        const thumbnail =
          media?.kind === 'image' && channelId !== undefined ? media.thumbnail : undefined;
        const body = entry.reply
          ? toolApprovalReplyPreview(message, preview.body, t)
          : preview.body;
        return (
          <QuoteCard
            key={key}
            ref={(element) => paintBotName(element, colorSource)}
            author={author}
            body={text ?? replyQuoteText(media, body, t)}
            part={text !== undefined}
            mine={mine}
            kind={quoted.kind === 'bot' || quoted.kind === 'human' ? quoted.kind : 'other'}
            media={media?.kind}
            thumb={
              thumbnail === undefined ||
              channelId === undefined ||
              text !== undefined ? undefined : (
                <ReplyQuoteThumb
                  thumbnail={thumbnail}
                  channelId={channelId}
                  messageId={entry.messageId}
                />
              )
            }
            note={note}
            noteLabel={t('message.quoteNoteLabel', { author })}
            jumpLabel={t('message.quoteJump', { author })}
            onJump={() => onJump(entry.messageId)}
          />
        );
      })}
    </QuoteCardList>
  );
}

import type { ReactElement } from 'react';
import { channelAttachmentUrl } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { formatAudioTime } from './message-audio.js';
import { useMessageResource } from './message-resource.js';
import type { ChannelAttachmentRef, ChannelReplyPreview } from './store.js';

export function replyQuoteText(
  media: ChannelReplyPreview['media'],
  body: string,
  t: BotHarnessTranslate,
): string {
  if (media === undefined) return body;
  if (media.kind === 'image') {
    if (body.trim().length > 0) return body;
    return media.count > 1
      ? t('message.replyMedia.photos', { count: String(media.count) })
      : t('message.replyMedia.photo');
  }
  if (media.kind === 'voice')
    return media.durationMs === undefined
      ? t('message.voice.label')
      : t('message.replyMedia.voice', { duration: formatAudioTime(media.durationMs / 1000) });
  return media.name;
}

export function ReplyQuoteThumb({
  thumbnail,
  channelId,
  messageId,
}: {
  thumbnail: ChannelAttachmentRef;
  channelId: string;
  messageId: string;
}): ReactElement {
  const { url } = useMessageResource(
    channelAttachmentUrl(thumbnail, { channelId, messageId }, '96c'),
  );
  return url === undefined ? (
    <span className="bh-bubble-reply-thumb" aria-hidden="true" />
  ) : (
    <img
      className="bh-bubble-reply-thumb"
      data-bubble-quote-thumb=""
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

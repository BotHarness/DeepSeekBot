import { useContext, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { botNameColor } from '../../../../../packages/client/src/client/bot-name-color';
import type { RosterBot } from '../../host/client';
import type { WireReplyPreview } from '../../host/wire';
import { botColor } from '../bot-color';
import { pressTint, quoteFill, useDesignTheme, type DesignTheme } from '../design/theme';
import { radius, space, swipeReply } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings, type t as strings } from '../strings';
import { voiceTime } from './voice-bar';
import { MessageIdentities } from './message-identities';

export function replyAuthor(
  preview: WireReplyPreview | null | undefined,
  you: string,
  botName: (id: string) => string,
): string {
  switch (preview?.author.kind) {
    case 'human':
      return you;
    case 'bot':
      return botName(preview.author.slug);
    case 'bridged':
      return preview.author.source;
    default:
      return '';
  }
}

export function replyText(preview: WireReplyPreview | null | undefined, t: typeof strings): string {
  if (!preview) return t.reply.unavailable;
  const body = preview.body.trim();
  const media = preview.media;
  switch (media?.kind) {
    case 'image':
      return body !== '' ? body : media.count > 1 ? t.reply.photos(media.count) : t.reply.photo;
    case 'voice':
      return media.durationMs !== undefined
        ? t.reply.voice(voiceTime(media.durationMs / 1000))
        : body !== ''
          ? t.reply.voice(body)
          : t.voiceLabel;
    case 'file':
      return body !== '' ? body : t.reply.file(media.name);
    default:
      return preview.body;
  }
}

function authorInk(
  preview: WireReplyPreview | null | undefined,
  bots: readonly RosterBot[],
  theme: DesignTheme,
  background: string,
): string {
  switch (preview?.author.kind) {
    case 'human':
      return botNameColor(theme.color.accent, background);
    case 'bot': {
      const slug = preview.author.slug;
      const bot = bots.find((candidate) => candidate.slug === slug);
      return bot === undefined ? theme.color.fg : botNameColor(botColor(bot), background);
    }
    case 'bridged':
      return theme.color.fg;
    default:
      return theme.color.muted;
  }
}

export function ReplyQuote({
  preview,
  botName,
  onAccent = false,
  thumbnail,
  onOpen,
}: {
  thumbnail?: ReactNode;
  preview: WireReplyPreview | null | undefined;
  botName: (id: string) => string;
  onAccent?: boolean;
  onOpen?: (() => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { bots } = useContext(MessageIdentities);
  const author = replyAuthor(preview, t.reply.you, botName);
  const text = replyText(preview, t);
  const background = onAccent ? theme.color.accent : theme.color.surface;
  const ink = onAccent ? theme.color.onAccent : authorInk(preview, bots, theme, background);
  const lines = theme.largeText ? 3 : 1;
  const block = {
    flexDirection: 'row',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: quoteFill(ink, background),
    paddingLeft: swipeReply.bar + space.x3,
    paddingRight: space.x3,
    paddingTop: space.x1,
    paddingBottom: space.x2,
    alignItems: 'center',
    gap: space.x3,
  } as const;
  const content = (
    <>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: swipeReply.bar,
          backgroundColor: ink,
        }}
      />
      {thumbnail}
      <View style={{ flexShrink: 1 }}>
        {author === '' ? null : (
          <Text
            testID="reply-quote-author"
            variant="meta"
            strong
            numberOfLines={lines}
            style={{ color: ink }}
          >
            {author}
          </Text>
        )}
        <Text
          testID="reply-quote-text"
          variant="meta"
          tone={onAccent ? 'onAccent' : 'fg'}
          numberOfLines={lines}
        >
          {text}
        </Text>
      </View>
    </>
  );
  if (onOpen === undefined || !preview)
    return (
      <View testID="reply-quote" style={block}>
        {content}
      </View>
    );
  return (
    <Pressable
      testID="reply-quote"
      accessibilityRole="button"
      accessibilityLabel={t.reply.quote(author, text)}
      accessibilityHint={t.reply.jumpHint}
      onPress={onOpen}
      android_ripple={{ color: pressTint(ink), foreground: true }}
      style={block}
    >
      {content}
    </Pressable>
  );
}

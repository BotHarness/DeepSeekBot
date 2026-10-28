import { View } from 'react-native';
import type { WireReplyPreview } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { radius, space, swipeReply } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

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

export function ReplyQuote({
  preview,
  botName,
  onAccent = false,
}: {
  preview: WireReplyPreview | null | undefined;
  botName: (id: string) => string;
  onAccent?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const author = replyAuthor(preview, t.reply.you, botName);
  const ink = onAccent ? 'onAccent' : 'fg';
  return (
    <View
      testID="reply-quote"
      style={{
        borderLeftWidth: swipeReply.bar,
        borderLeftColor: onAccent ? theme.color.onAccent : theme.color.accent,
        borderRadius: radius.xs,
        paddingLeft: space.x3,
        gap: space.x1,
        opacity: 0.85,
      }}
    >
      {author === '' ? null : (
        <Text variant="meta" tone={ink} strong numberOfLines={1}>
          {author}
        </Text>
      )}
      <Text variant="meta" tone={onAccent ? 'onAccent' : 'muted'} numberOfLines={2}>
        {preview ? preview.body : t.reply.unavailable}
      </Text>
    </View>
  );
}

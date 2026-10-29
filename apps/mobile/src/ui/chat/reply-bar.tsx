import { Pressable, View } from 'react-native';
import type { ConversationMessage } from '../../host/conversation';
import { useDesignTheme } from '../design/theme';
import { radius, space, swipeReply } from '../design/tokens';
import { CloseIcon, ReplyIcon } from '../shell/icons';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { replyAuthor } from './reply-quote';

export function ReplyBar({
  message,
  botName,
  onCancel,
}: {
  message: ConversationMessage;
  botName: (id: string) => string;
  onCancel(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const author = replyAuthor(
    {
      author:
        message.author === 'human'
          ? { kind: 'human' }
          : message.bot !== undefined
            ? { kind: 'bot', slug: message.bot }
            : { kind: 'system' },
      body: message.body,
    },
    t.reply.you,
    botName,
  );
  return (
    <View
      testID="composer-reply"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x3,
      }}
    >
      <ReplyIcon color={theme.color.accent} size={theme.type.meta.line} />
      <View
        style={{
          flex: 1,
          borderLeftWidth: swipeReply.bar,
          borderLeftColor: theme.color.accent,
          borderRadius: radius.xs,
          paddingLeft: space.x3,
        }}
      >
        <Text variant="meta" strong numberOfLines={1}>
          {t.reply.to(author)}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {message.body.trim() !== ''
            ? message.body
            : (message.attachments[0]?.name ?? t.reply.unavailable)}
        </Text>
      </View>
      <Pressable
        testID="composer-reply-cancel"
        accessibilityRole="button"
        accessibilityLabel={t.reply.cancel}
        hitSlop={space.x2}
        onPress={onCancel}
        style={({ pressed }) => ({
          width: theme.touch,
          height: theme.touch,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.round,
          backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
        })}
      >
        <CloseIcon color={theme.color.muted} size={theme.type.meta.line} />
      </Pressable>
    </View>
  );
}

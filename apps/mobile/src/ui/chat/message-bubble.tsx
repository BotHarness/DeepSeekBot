import { Pressable, View } from 'react-native';

import type {
  ConversationDraft,
  ConversationMessage,
  MessageAttachment,
} from '../../host/conversation';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { MarkdownView } from '../markdown-view';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { MessageAttachments } from './message-attachments';
import { openMessageMenu } from './message-menu';

export function deliveryLabel(message: ConversationMessage): string | undefined {
  if (message.author !== 'human') return undefined;
  if (message.delivery === 'pending') return t.sending;
  if (message.delivery === 'failed') return `${t.notSent} · ${t.retrySend}`;
  return message.revision === undefined ? t.sent : undefined;
}

export function MessageBubble({
  message,
  first = true,
  last = true,
  onRetry,
  onOpenImage = () => {},
  onShare = async () => {},
  onLongPress = openMessageMenu,
}: {
  message: ConversationMessage;
  first?: boolean;
  last?: boolean;
  onRetry?: (messageId: string) => void;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  onLongPress?: (text: string) => void;
}) {
  const theme = useDesignTheme();
  const human = message.author === 'human';
  const failed = message.delivery === 'failed';
  const label = deliveryLabel(message);
  if (message.author === 'system')
    return (
      <View
        style={{ paddingHorizontal: space.x6, paddingVertical: space.x2, alignItems: 'center' }}
      >
        <Text selectable variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {message.body}
        </Text>
      </View>
    );
  const ink = human ? 'onAccent' : 'fg';
  const copyable = message.body.trim() !== '';
  const bubble = (
    <View
      style={{
        maxWidth: '80%',
        alignSelf: human ? 'flex-end' : 'flex-start',
        backgroundColor: human ? theme.color.accent : theme.color.surface,
        borderRadius: radius.lg,
        ...(human
          ? {
              borderTopRightRadius: first ? radius.lg : radius.xs,
              borderBottomRightRadius: last ? radius.lg : radius.xs,
            }
          : {
              borderTopLeftRadius: first ? radius.lg : radius.xs,
              borderBottomLeftRadius: last ? radius.lg : radius.xs,
            }),
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        gap: space.x2,
        opacity: message.delivery === 'pending' ? 0.7 : 1,
      }}
    >
      {!copyable ? null : human ? (
        <Text tone={ink}>{message.body}</Text>
      ) : (
        <MarkdownView source={message.body} color={theme.color[ink]} selectable={false} />
      )}
      {message.attachments.length > 0 ? (
        <MessageAttachments
          attachments={message.attachments}
          human={human}
          onOpenImage={onOpenImage}
          onShare={onShare}
        />
      ) : null}
      {message.card ? (
        <Text variant="meta" tone={human ? ink : 'muted'} style={{ fontStyle: 'italic' }}>
          {t.card}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View
      style={{
        paddingHorizontal: space.x4,
        paddingTop: first ? space.x3 : space.x1,
        gap: space.x1,
      }}
    >
      {failed || copyable ? (
        <Pressable
          {...(failed ? { accessibilityRole: 'button' as const, accessibilityLabel: label } : {})}
          {...(copyable
            ? {
                accessibilityHint: t.messageActionsHint,
                accessibilityActions: [{ name: 'copy', label: t.copy }],
                onAccessibilityAction: () => onLongPress(message.body),
                onLongPress: () => onLongPress(message.body),
              }
            : {})}
          {...(failed ? { onPress: () => onRetry?.(message.id) } : {})}
        >
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
      {label === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          variant="meta"
          tone={failed ? 'danger' : 'muted'}
          style={{ alignSelf: 'flex-end' }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

export function DraftBubble({ draft }: { draft: ConversationDraft }) {
  const theme = useDesignTheme();
  return (
    <View style={{ paddingHorizontal: space.x4, paddingTop: space.x3, gap: space.x1 }}>
      <View
        style={{
          maxWidth: '80%',
          alignSelf: 'flex-start',
          backgroundColor: theme.color.surface,
          borderRadius: radius.lg,
          paddingHorizontal: space.x4,
          paddingVertical: space.x3,
        }}
      >
        {draft.body.trim() === '' ? (
          <Text tone="muted">…</Text>
        ) : (
          <MarkdownView source={draft.body} />
        )}
      </View>
      <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
        {t.typing}
      </Text>
    </View>
  );
}

import { Pressable, View } from 'react-native';

import type { ConversationDraft, ConversationMessage } from '../host/conversation';
import { radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { MarkdownView } from './markdown-view';
import { Text } from './primitives/text';
import { t } from './strings';

export function deliveryLabel(message: ConversationMessage): string | undefined {
  if (message.author !== 'human') return undefined;
  if (message.delivery === 'pending') return t.sending;
  if (message.delivery === 'failed') return `${t.notSent} · ${t.retrySend}`;
  return message.revision === undefined ? t.sent : undefined;
}

export function MessageBubble({
  message,
  onRetry,
}: {
  message: ConversationMessage;
  onRetry?: (messageId: string) => void;
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
  const bubble = (
    <View
      style={{
        maxWidth: '80%',
        alignSelf: human ? 'flex-end' : 'flex-start',
        backgroundColor: human ? theme.color.accent : theme.color.surface,
        borderRadius: radius.lg,
        paddingHorizontal: space.x4,
        paddingVertical: space.x3,
        gap: space.x2,
        opacity: message.delivery === 'pending' ? 0.7 : 1,
      }}
    >
      {message.body.trim() === '' ? null : human ? (
        <Text selectable tone={ink}>
          {message.body}
        </Text>
      ) : (
        <MarkdownView source={message.body} color={theme.color[ink]} />
      )}
      {message.attachments > 0 ? (
        <Text variant="meta" tone={human ? ink : 'muted'} style={{ fontStyle: 'italic' }}>
          📎 {t.attachments(message.attachments)}
        </Text>
      ) : null}
      {message.card ? (
        <Text variant="meta" tone={human ? ink : 'muted'} style={{ fontStyle: 'italic' }}>
          {t.card}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={{ paddingHorizontal: space.x4, paddingVertical: space.x1, gap: space.x1 }}>
      {failed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onRetry?.(message.id)}
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
    <View style={{ paddingHorizontal: space.x4, paddingVertical: space.x1, gap: space.x1 }}>
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

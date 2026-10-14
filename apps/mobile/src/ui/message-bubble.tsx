import { Pressable, Text, View } from 'react-native';

import type { ConversationDraft, ConversationMessage } from '../host/conversation';
import { MarkdownView } from './markdown-view';
import { t } from './strings';
import { useTheme } from './theme';

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
  const theme = useTheme();
  const human = message.author === 'human';
  const failed = message.delivery === 'failed';
  const label = deliveryLabel(message);
  if (message.author === 'system')
    return (
      <View style={{ paddingHorizontal: 24, paddingVertical: 6, alignItems: 'center' }}>
        <Text selectable style={{ color: theme.inkSoft, fontSize: 13, textAlign: 'center' }}>
          {message.body}
        </Text>
      </View>
    );
  const ink = human ? theme.humanInk : theme.ink;
  const bubble = (
    <View
      style={{
        maxWidth: '86%',
        alignSelf: human ? 'flex-end' : 'flex-start',
        backgroundColor: human ? theme.humanBubble : theme.botBubble,
        borderRadius: 18,
        borderWidth: human ? 0 : 1,
        borderColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 9,
        gap: 6,
        opacity: message.delivery === 'pending' ? 0.7 : 1,
      }}
    >
      {message.body.trim() === '' ? null : human ? (
        <Text selectable style={{ color: ink, fontSize: 16, lineHeight: 22 }}>
          {message.body}
        </Text>
      ) : (
        <MarkdownView source={message.body} color={ink} />
      )}
      {message.attachments > 0 ? (
        <Text style={{ color: human ? ink : theme.inkSoft, fontSize: 13, fontStyle: 'italic' }}>
          📎 {t.attachments(message.attachments)}
        </Text>
      ) : null}
      {message.card ? (
        <Text style={{ color: theme.inkSoft, fontSize: 13, fontStyle: 'italic' }}>{t.card}</Text>
      ) : null}
    </View>
  );
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 3, gap: 2 }}>
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
          style={{
            alignSelf: 'flex-end',
            fontSize: 12,
            color: failed ? theme.danger : theme.inkSoft,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

export function DraftBubble({ draft }: { draft: ConversationDraft }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 3, gap: 2 }}>
      <View
        style={{
          maxWidth: '86%',
          alignSelf: 'flex-start',
          backgroundColor: theme.botBubble,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        {draft.body.trim() === '' ? (
          <Text style={{ color: theme.inkSoft, fontSize: 16 }}>…</Text>
        ) : (
          <MarkdownView source={draft.body} />
        )}
      </View>
      <Text style={{ fontSize: 12, color: theme.inkSoft }} accessibilityLiveRegion="polite">
        {t.typing}
      </Text>
    </View>
  );
}

import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import {
  reactable,
  type ConversationDraft,
  type ConversationMessage,
  type MessageAttachment,
} from '../../host/conversation';
import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { MarkdownView } from '../markdown-view';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { bubbleRow, bubbleShape } from './bubble-shape';
import { MessageAttachments } from './message-attachments';
import { openMessageMenu } from './message-menu';
import { ReactionChips } from './message-reactions';

export function deliveryLabel(message: ConversationMessage): string | undefined {
  if (message.author !== 'human') return undefined;
  if (message.delivery === 'pending') return t.sending;
  if (message.delivery === 'failed') return `${t.notSent} · ${t.retrySend}`;
  return message.revision === undefined ? t.sent : undefined;
}

export type Speaker = { name: string; bot: RosterBot | undefined; first: boolean };

const SPEAKER_AVATAR = 32;

export const MessageBubble = memo(function MessageBubble({
  message,
  first = true,
  last = true,
  onRetry,
  onOpenImage = () => {},
  onShare = async () => {},
  onLongPress = (pressed) => openMessageMenu(pressed.body),
  onReact,
  botName = (id) => id,
  speaker,
}: {
  message: ConversationMessage;
  first?: boolean;
  last?: boolean;
  onRetry?: (messageId: string) => void;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  onLongPress?: (message: ConversationMessage) => void;
  onReact?: (messageId: string, emoji: string, active: boolean) => void;
  botName?: (id: string) => string;
  speaker?: Speaker | undefined;
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
  const actionable = copyable || (onReact !== undefined && reactable(message));
  const reactions = message.reactions ?? [];
  const bubble = (
    <View
      style={{
        ...bubbleShape(human, { first, last }),
        backgroundColor: human ? theme.color.accent : theme.color.surface,
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
  const body = (
    <>
      {failed || actionable ? (
        <Pressable
          {...(failed ? { accessibilityRole: 'button' as const, accessibilityLabel: label } : {})}
          {...(actionable
            ? {
                accessibilityHint: onReact === undefined ? t.copyHint : t.messageActionsHint,
                accessibilityActions: [
                  { name: 'longpress', label: onReact === undefined ? t.copy : t.messageActions },
                ],
                onAccessibilityAction: () => onLongPress(message),
                onLongPress: () => onLongPress(message),
              }
            : {})}
          {...(failed ? { onPress: () => onRetry?.(message.id) } : {})}
        >
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
      {reactions.length === 0 ? null : (
        <ReactionChips
          reactions={reactions}
          human={human}
          botName={botName}
          {...(onReact === undefined
            ? {}
            : { onToggle: (emoji: string, active: boolean) => onReact(message.id, emoji, active) })}
        />
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
    </>
  );
  return (
    <View style={bubbleRow(first)}>
      {speaker === undefined ? (
        <View style={{ gap: space.x1 }}>{body}</View>
      ) : (
        <SpeakerColumns speaker={speaker}>{body}</SpeakerColumns>
      )}
    </View>
  );
});

function SpeakerColumns({ speaker, children }: { speaker: Speaker; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
      <View style={{ width: SPEAKER_AVATAR }}>
        {speaker.first ? <SpeakerAvatar speaker={speaker} /> : null}
      </View>
      <View style={{ flex: 1, gap: space.x1 }}>
        {speaker.first ? <AuthorName name={speaker.name} /> : null}
        {children}
      </View>
    </View>
  );
}

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  const theme = useDesignTheme();
  if (speaker.bot !== undefined)
    return <BotAvatar bot={speaker.bot} size={SPEAKER_AVATAR} ring={false} />;
  return (
    <View
      style={{
        width: SPEAKER_AVATAR,
        height: SPEAKER_AVATAR,
        borderRadius: radius.round,
        backgroundColor: theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text strong tone="muted">
        {Array.from(speaker.name)[0] ?? ''}
      </Text>
    </View>
  );
}

function AuthorName({ name }: { name: string }) {
  return (
    <Text variant="meta" tone="muted" strong numberOfLines={1}>
      {name}
    </Text>
  );
}

export const DraftBubble = memo(function DraftBubble({
  draft,
  speaker,
}: {
  draft: ConversationDraft;
  speaker?: Speaker | undefined;
}) {
  const theme = useDesignTheme();
  const body = (
    <>
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
          <MarkdownView source={draft.body} streaming />
        )}
      </View>
      <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
        {t.typing}
      </Text>
    </>
  );
  return (
    <View style={{ paddingHorizontal: space.x4, paddingTop: space.x3 }}>
      {speaker === undefined ? (
        <View style={{ gap: space.x1 }}>{body}</View>
      ) : (
        <SpeakerColumns speaker={speaker}>{body}</SpeakerColumns>
      )}
    </View>
  );
});

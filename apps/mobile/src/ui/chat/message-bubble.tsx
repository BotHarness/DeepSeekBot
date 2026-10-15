import { memo, useRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  View,
  type AccessibilityRole,
  type DimensionValue,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  reactable,
  type ConversationDraft,
  type ConversationMessage,
  type MessageAttachment,
} from '../../host/conversation';
import { lift, motion, radius, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { MarkdownView } from '../markdown-view';
import { Text } from '../primitives/text';
import { haptic } from '../haptics';
import { t } from '../strings';
import { bubbleCorners, bubbleRow, bubbleShape, type BubbleGroup } from './bubble-shape';
import { MessageAttachments } from './message-attachments';
import { openMessageMenu } from './message-menu';
import { ReactionChips } from './message-reactions';
import type { Rect } from './menu-placement';
import { SpeakerRow, type Speaker } from './speaker-row';

export type { Speaker } from './speaker-row';

export function deliveryLabel(message: ConversationMessage): string | undefined {
  if (message.author !== 'human') return undefined;
  if (message.delivery === 'pending') return t.sending;
  if (message.delivery === 'failed') return `${t.notSent} · ${t.retrySend}`;
  return message.revision === undefined ? t.sent : undefined;
}

export function BubbleBody({
  message,
  group,
  onOpenImage = () => {},
  onShare = async () => {},
  fill,
}: {
  message: ConversationMessage;
  group: BubbleGroup;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  fill?: { maxWidth?: DimensionValue; width?: number; maxHeight?: number } | undefined;
}) {
  const theme = useDesignTheme();
  const human = message.author === 'human';
  const ink = human ? 'onAccent' : 'fg';
  return (
    <View
      style={{
        ...bubbleShape(human, group),
        ...fill,
        overflow: fill?.maxHeight === undefined ? 'visible' : 'hidden',
        backgroundColor: human ? theme.color.accent : theme.color.surface,
        gap: space.x2,
        opacity: message.delivery === 'pending' ? 0.7 : 1,
      }}
    >
      {message.body.trim() === '' ? null : human ? (
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
}

function PressableBubble({
  human,
  group,
  lifted,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActionLabel,
  onPress,
  onLongPress,
  children,
}: {
  human: boolean;
  group: BubbleGroup;
  lifted: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string | undefined;
  accessibilityHint?: string;
  accessibilityActionLabel?: string;
  onPress?: () => void;
  onLongPress?: (anchor: Rect) => void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const ref = useRef<View>(null);
  const anchor = useRef<Rect | undefined>(undefined);
  const scale = useSharedValue(1);
  const held = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const shrinks = Platform.OS === 'ios' && !reduced && onLongPress !== undefined;
  const measure = (then?: (rect: Rect) => void) =>
    ref.current?.measureInWindow((x, y, width, height) => {
      anchor.current = { x, y, width, height };
      then?.(anchor.current);
    });
  const open = () => {
    if (onLongPress === undefined) return;
    if (anchor.current !== undefined) onLongPress(anchor.current);
    else measure(onLongPress);
  };
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      style={[
        {
          ...bubbleCorners(human, group),
          maxWidth: '80%',
          alignSelf: human ? 'flex-end' : 'flex-start',
          overflow: 'hidden',
          opacity: lifted ? 0 : 1,
        },
        held,
      ]}
    >
      <Pressable
        {...(accessibilityRole === undefined ? {} : { accessibilityRole })}
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
        {...(onLongPress === undefined
          ? {}
          : {
              accessibilityActions: [
                { name: 'longpress', label: accessibilityActionLabel ?? t.messageActions },
              ],
              onAccessibilityAction: () => {
                anchor.current = undefined;
                open();
              },
              onLongPress: () => {
                haptic('menu');
                if (shrinks) scale.value = withTiming(1, { duration: motion.menu });
                open();
              },
            })}
        {...(onPress === undefined ? {} : { onPress })}
        delayLongPress={motion.lift}
        android_ripple={{
          color: pressTint(human ? theme.color.onAccent : theme.color.fg),
          foreground: true,
        }}
        onPressIn={() => {
          anchor.current = undefined;
          measure();
          if (shrinks)
            scale.value = withTiming(lift, {
              duration: motion.lift,
              easing: Easing.out(Easing.quad),
            });
        }}
        onPressOut={() => {
          if (shrinks) scale.value = withTiming(1, { duration: motion.menu });
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

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
  lifted = false,
}: {
  message: ConversationMessage;
  first?: boolean;
  last?: boolean;
  onRetry?: (messageId: string) => void;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  onLongPress?: (message: ConversationMessage, anchor: Rect, group: BubbleGroup) => void;
  onReact?: (messageId: string, emoji: string, active: boolean) => void;
  botName?: (id: string) => string;
  speaker?: Speaker | undefined;
  lifted?: boolean;
}) {
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
  const copyable = message.body.trim() !== '';
  const actionable = copyable || (onReact !== undefined && reactable(message));
  const reactions = message.reactions ?? [];
  const group = { first, last };
  const bubble = (
    <BubbleBody
      message={message}
      group={group}
      onOpenImage={onOpenImage}
      onShare={onShare}
      fill={failed || actionable ? { maxWidth: '100%' } : undefined}
    />
  );
  const surface =
    failed || actionable ? (
      <PressableBubble
        human={human}
        group={group}
        lifted={lifted}
        {...(failed ? { accessibilityRole: 'button' as const, accessibilityLabel: label } : {})}
        {...(actionable
          ? {
              accessibilityHint: onReact === undefined ? t.copyHint : t.messageActionsHint,
              accessibilityActionLabel: onReact === undefined ? t.copy : t.messageActions,
              onLongPress: (anchor: Rect) => onLongPress(message, anchor, group),
            }
          : {})}
        {...(failed ? { onPress: () => onRetry?.(message.id) } : {})}
      >
        {bubble}
      </PressableBubble>
    ) : (
      bubble
    );
  const after = (
    <>
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
  const row = bubbleRow(first);
  if (speaker !== undefined)
    return (
      <SpeakerRow
        speaker={speaker}
        rowKey={message.id}
        inset={row.paddingTop}
        style={row}
        bubble={surface}
        after={after}
      />
    );
  return (
    <View style={{ ...row, gap: space.x1 }}>
      {surface}
      {after}
    </View>
  );
});

export const DraftBubble = memo(function DraftBubble({
  draft,
  speaker,
}: {
  draft: ConversationDraft;
  speaker?: Speaker | undefined;
}) {
  const theme = useDesignTheme();
  const surface = (
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
  );
  const typing = (
    <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
      {t.typing}
    </Text>
  );
  const row = { paddingHorizontal: space.x4, paddingTop: space.x3 };
  if (speaker !== undefined)
    return (
      <SpeakerRow
        speaker={speaker}
        rowKey={`draft:${draft.draftId}`}
        inset={row.paddingTop}
        style={row}
        bubble={surface}
        after={typing}
      />
    );
  return (
    <View style={{ ...row, gap: space.x1 }}>
      {surface}
      {typing}
    </View>
  );
});

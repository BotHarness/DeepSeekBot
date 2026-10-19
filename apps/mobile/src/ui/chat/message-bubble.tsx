import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  View,
  type AccessibilityRole,
  type DimensionValue,
  type ViewInstance,
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
  reactedByMe,
  type ConversationDraft,
  type ConversationMessage,
  type MessageAttachment,
} from '../../host/conversation';
import type { ConversationPlayback } from '../../host/conversation-playback';
import { doubleTap, lift, motion, radius, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { MessageBody } from './message-body';
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
  streaming = false,
}: {
  message: ConversationMessage;
  group: BubbleGroup;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  fill?: { maxWidth?: DimensionValue; width?: number; maxHeight?: number } | undefined;
  streaming?: boolean;
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
        opacity: human && message.delivery === 'pending' ? 0.7 : 1,
      }}
    >
      <MessageBody message={message} streaming={streaming} />
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
  onDoubleTap,
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
  onDoubleTap?: () => void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const ref = useRef<ViewInstance>(null);
  const anchor = useRef<Rect | undefined>(undefined);
  const tapped = useRef<number | undefined>(undefined);
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
        {...(onPress !== undefined
          ? { onPress }
          : onDoubleTap === undefined
            ? {}
            : {
                onPress: () => {
                  const now = Date.now();
                  if (secondTap(tapped.current, now)) {
                    tapped.current = undefined;
                    haptic('react');
                    onDoubleTap();
                  } else tapped.current = now;
                },
              })}
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

export function secondTap(last: number | undefined, now: number): boolean {
  return last !== undefined && now - last <= doubleTap.window;
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
  streaming = false,
  rowKey = message.id,
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
  streaming?: boolean;
  rowKey?: string;
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
  const actionable = !streaming && (copyable || (onReact !== undefined && reactable(message)));
  const reactions = streaming ? [] : (message.reactions ?? []);
  const group = { first, last, avatar: speaker?.last === true };
  const bubble = (
    <BubbleBody
      message={message}
      group={group}
      onOpenImage={onOpenImage}
      onShare={onShare}
      fill={failed || actionable || streaming ? { maxWidth: '100%' } : undefined}
      streaming={streaming}
    />
  );
  const surface =
    failed || actionable || streaming ? (
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
        {...(!streaming && onReact !== undefined && reactable(message)
          ? {
              onDoubleTap: () =>
                onReact(
                  message.id,
                  doubleTap.emoji,
                  !(message.reactions ?? []).some(
                    (reaction) => reaction.emoji === doubleTap.emoji && reactedByMe(reaction),
                  ),
                ),
            }
          : {})}
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
        rowKey={rowKey}
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
  const message: ConversationMessage = {
    id: `draft:${draft.draftId}`,
    at: '',
    author: 'bot',
    bot: draft.botSlug,
    body: draft.body,
    attachments: [],
    delivery: 'pending',
  };
  return <MessageBubble message={message} speaker={speaker} streaming />;
});

export const PlaybackBubble = memo(function PlaybackBubble({
  playback,
  queueKey,
  message,
  ...props
}: Omit<ComponentProps<typeof MessageBubble>, 'message' | 'streaming'> & {
  playback?: ConversationPlayback | undefined;
  queueKey: string;
  message?: ConversationMessage | undefined;
}) {
  const fallback = useMemo(
    () => (message === undefined ? undefined : { message, streaming: false }),
    [message],
  );
  const subscribe = useCallback(
    (listener: () => void) => playback?.subscribeBubble(queueKey, listener) ?? (() => {}),
    [playback, queueKey],
  );
  const read = useCallback(
    () => playback?.getBubble(queueKey) ?? fallback,
    [playback, queueKey, fallback],
  );
  const snapshot = useSyncExternalStore(subscribe, read);
  return snapshot === undefined ? null : (
    <MessageBubble
      {...props}
      rowKey={queueKey}
      message={snapshot.message}
      streaming={snapshot.streaming}
    />
  );
});

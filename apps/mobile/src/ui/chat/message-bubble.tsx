import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useReplyHaptic } from './reply-haptic';
import {
  AppState,
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
import type { RosterBot } from '../../host/client';
import type { ConversationPlayback } from '../../host/conversation-playback';
import { doubleTap, lift, motion, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { MessageBody } from './message-body';
import { Text } from '../primitives/text';
import { StreamSurface } from '../primitives/stream-surface';
import { haptic } from '../haptics';
import { useStrings, t } from '../strings';
import {
  BADGE_OVERLAP,
  BUBBLE_MAX,
  bubbleCorners,
  bubbleRow,
  bubbleShape,
  type BubbleGroup,
} from './bubble-shape';
import { DeliveryReceiptButton, ReadingBadge } from './delivery-stack';
import { MessageAttachments } from './message-attachments';
import { openMessageMenu } from './message-menu';
import { ReactionChips } from './message-reactions';
import type { Rect } from './menu-placement';
import { SpeakerRow, type Speaker } from './speaker-row';

export type { Speaker } from './speaker-row';

export function deliveryLabel(message: ConversationMessage): string | undefined {
  if (message.author !== 'human') return undefined;
  if (message.delivery === 'pending') return undefined;
  if (message.delivery === 'failed') return `${t.notSent} · ${t.retrySend}`;
  return message.revision === undefined ? t.sent : undefined;
}

const PENDING_FEEDBACK_MS = 3_000;

const NO_READERS: readonly string[] = [];

const NO_BOTS: readonly RosterBot[] = [];

function usePendingFeedback(message: ConversationMessage): boolean {
  const started =
    message.author === 'human' && message.delivery === 'pending'
      ? message.attemptStartedAt
      : undefined;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (started === undefined) return () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const update = () => {
        clearTimeout(timer);
        if (AppState.currentState !== 'active') return;
        notify();
        const remaining = started + PENDING_FEEDBACK_MS - Date.now();
        if (remaining > 0) timer = setTimeout(update, remaining);
      };
      update();
      const subscription = AppState.addEventListener('change', update);
      return () => {
        clearTimeout(timer);
        subscription.remove();
      };
    },
    [started],
  );
  const snapshot = useCallback(
    () => started !== undefined && Date.now() >= started + PENDING_FEEDBACK_MS,
    [started],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function BubbleBody({
  message,
  group,
  onOpenImage = () => {},
  onShare = async () => {},
  fill,
  streaming = false,
  deliveryAccessibility = true,
  onImageReady,
}: {
  onImageReady?: ((key: string, ready: boolean) => void) | undefined;
  message: ConversationMessage;
  group: BubbleGroup;
  onOpenImage?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => Promise<void>;
  fill?: { maxWidth?: DimensionValue; width?: number; maxHeight?: number } | undefined;
  streaming?: boolean;
  deliveryAccessibility?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const human = message.author === 'human';
  const ink = human ? 'onAccent' : 'fg';
  return (
    <StreamSurface
      active={streaming}
      style={{
        ...bubbleShape(human, group),
        ...fill,
        overflow: fill?.maxHeight === undefined ? 'visible' : 'hidden',
        backgroundColor: human ? theme.color.accent : theme.color.surface,
        gap: space.x2,
      }}
    >
      {deliveryAccessibility && human && message.delivery === 'pending' ? (
        <View
          accessible
          accessibilityLabel={t.sending}
          accessibilityState={{ busy: true }}
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}
        />
      ) : null}
      <MessageBody message={message} streaming={streaming} />
      {message.attachments.length > 0 ? (
        <MessageAttachments
          attachments={message.attachments}
          human={human}
          onOpenImage={onOpenImage}
          onShare={onShare}
          onImageReady={onImageReady}
        />
      ) : null}
      {message.card ? (
        <Text variant="meta" tone={human ? ink : 'muted'} style={{ fontStyle: 'italic' }}>
          {t.card}
        </Text>
      ) : null}
    </StreamSurface>
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
  pending = false,
  ungrouped = false,
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
  pending?: boolean;
  ungrouped?: boolean;
  onPress?: () => void;
  onLongPress?: (anchor: Rect) => void;
  onDoubleTap?: () => void;
  children: ReactNode;
}) {
  const t = useStrings();
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
          maxWidth: '100%',
          alignSelf: human ? 'flex-end' : 'flex-start',
          overflow: 'hidden',
          opacity: lifted ? 0 : 1,
        },
        held,
      ]}
    >
      <Pressable
        {...(ungrouped ? { accessible: false } : {})}
        {...(pending
          ? { accessibilityState: { busy: true }, accessibilityValue: { text: t.sending } }
          : {})}
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
  onOpenDelivery,
  readers = NO_READERS,
  bots = NO_BOTS,
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
  onOpenDelivery?: ((message: ConversationMessage) => void) | undefined;
  readers?: readonly string[] | undefined;
  bots?: readonly RosterBot[] | undefined;
  botName?: (id: string) => string;
  speaker?: Speaker | undefined;
  lifted?: boolean;
  streaming?: boolean;
  rowKey?: string;
}) {
  const t = useStrings();
  const human = message.author === 'human';
  const failed = message.delivery === 'failed';
  const label = deliveryLabel(message);
  const pendingFeedback = usePendingFeedback(message);
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
  const actionable =
    !streaming &&
    (copyable || message.attachments.length > 0 || (onReact !== undefined && reactable(message)));
  const reactions = streaming ? [] : (message.reactions ?? []);
  const group = { first, last, avatar: speaker?.last === true };
  const bubble = (
    <BubbleBody
      message={message}
      group={group}
      onOpenImage={onOpenImage}
      onShare={onShare}
      deliveryAccessibility={
        (human && message.delivery === 'pending' && message.attachments.length > 0) ||
        !(failed || actionable || streaming)
      }
      fill={{ maxWidth: '100%' }}
      streaming={streaming}
    />
  );
  const content =
    failed || actionable || streaming ? (
      <PressableBubble
        human={human}
        group={group}
        lifted={lifted}
        pending={human && message.delivery === 'pending'}
        ungrouped={human && message.delivery === 'pending' && message.attachments.length > 0}
        {...(failed ? { accessibilityRole: 'button' as const, accessibilityLabel: label } : {})}
        {...(actionable
          ? {
              accessibilityHint: t.messageActionsHint,
              accessibilityActionLabel: t.messageActions,
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
  const reading = streaming ? NO_READERS : readers;
  const badged = reactions.length > 0 || reading.length > 0;
  const framed = (
    <View
      style={{
        alignSelf: human ? 'flex-end' : 'flex-start',
        maxWidth: BUBBLE_MAX,
      }}
    >
      {content}
      {badged ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: -BADGE_OVERLAP,
            left: space.x4,
            right: space.x4,
            flexDirection: human ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: space.x2,
          }}
        >
          {reactions.length === 0 ? null : (
            <ReactionChips
              reactions={reactions}
              human={human}
              botName={botName}
              {...(onReact === undefined
                ? {}
                : {
                    onToggle: (emoji: string, active: boolean) =>
                      onReact(message.id, emoji, active),
                  })}
            />
          )}
          {reading.length === 0 ? null : (
            <View style={human ? { marginRight: 'auto' } : { marginLeft: 'auto' }}>
              <ReadingBadge messageId={message.id} readers={reading} bots={bots} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
  const surface = human ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        gap: space.x2,
      }}
    >
      <View
        style={{
          minWidth: space.x6,
          alignItems: 'center',
          paddingBottom: space.x1,
        }}
      >
        {failed ? (
          <Pressable
            testID={`message-retry-${message.id}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onRetry?.(message.id)}
          >
            <Text variant="meta" tone="danger">
              !
            </Text>
          </Pressable>
        ) : pendingFeedback ? (
          <Text
            accessibilityLabel={t.sending}
            accessibilityLiveRegion="polite"
            variant="meta"
            tone="muted"
          >
            …
          </Text>
        ) : onOpenDelivery !== undefined && !streaming ? (
          <DeliveryReceiptButton message={message} bots={bots} onOpen={onOpenDelivery} />
        ) : null}
      </View>
      {framed}
    </View>
  ) : (
    framed
  );
  const row = { ...bubbleRow(first), ...(last ? { paddingBottom: space.x2 } : {}) };
  if (speaker !== undefined)
    return (
      <SpeakerRow
        speaker={speaker}
        rowKey={rowKey}
        inset={row.paddingTop}
        style={row}
        bubble={surface}
      />
    );
  return <View style={row}>{surface}</View>;
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
  focused = false,
  ...props
}: Omit<ComponentProps<typeof MessageBubble>, 'message' | 'streaming'> & {
  playback?: ConversationPlayback | undefined;
  queueKey: string;
  focused?: boolean;
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
  useReplyHaptic(playback, queueKey, snapshot, focused);
  return snapshot === undefined ? null : (
    <MessageBubble
      {...props}
      rowKey={queueKey}
      message={snapshot.message}
      streaming={snapshot.streaming}
    />
  );
});

import { Pressable, View, type ViewInstance } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { RosterBot } from '../../host/client';
import type { ConversationMessage } from '../../host/conversation';
import {
  receiptGroups,
  receiptRecipients,
  type ReceiptRecipient,
  type ReceiptState,
} from '../../host/delivery-receipt';
import { BotPortrait } from '../bot-avatar';
import type { DesignTheme } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { chipShadow } from './message-reactions';

const STACK_LIMIT = 3;
const STACK_AVATAR = 16;
const STACK_RING = 1.5;

export function receiptColor(theme: DesignTheme, state: ReceiptState): string {
  switch (state) {
    case 'handled':
      return theme.color.success;
    case 'running':
      return theme.color.accent;
    case 'observed':
      return theme.color.fg;
    case 'pending':
      return theme.color.muted;
    case 'ignored':
      return theme.color.subtle;
    case 'missing':
      return theme.color.warning;
    default:
      return theme.color.danger;
  }
}

function StackedAvatar({
  botSlug,
  bots,
  ring,
  first,
}: {
  botSlug: string;
  bots: readonly RosterBot[];
  ring: string;
  first: boolean;
}) {
  const theme = useDesignTheme();
  const bot = bots.find((entry) => entry.slug === botSlug);
  return (
    <View
      style={{
        marginLeft: first ? 0 : -space.x3,
        borderRadius: radius.round,
        borderWidth: STACK_RING,
        borderColor: ring,
        backgroundColor: theme.color.base,
      }}
    >
      {bot === undefined ? (
        <View
          style={{
            width: STACK_AVATAR,
            height: STACK_AVATAR,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.surface,
          }}
        >
          <Text
            variant="meta"
            tone="muted"
            style={{ fontSize: STACK_AVATAR / 2, lineHeight: STACK_AVATAR }}
          >
            {botSlug.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ) : (
        <BotPortrait bot={bot} size={STACK_AVATAR} />
      )}
    </View>
  );
}

export function AvatarStack({
  items,
  bots,
}: {
  items: readonly { botSlug: string; ring: string }[];
  bots: readonly RosterBot[];
}) {
  const t = useStrings();
  const shown = items.slice(0, STACK_LIMIT);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((item, index) => (
        <StackedAvatar
          key={item.botSlug}
          botSlug={item.botSlug}
          bots={bots}
          ring={item.ring}
          first={index === 0}
        />
      ))}
      {items.length > STACK_LIMIT ? (
        <Text variant="meta" tone="muted" style={{ marginLeft: space.x1 }}>
          {t.delivery.more(items.length - STACK_LIMIT)}
        </Text>
      ) : null}
    </View>
  );
}

export function useReceiptCounts(recipients: readonly ReceiptRecipient[]): string {
  const t = useStrings();
  return receiptGroups(recipients)
    .map((group) => `${group.recipients.length} ${t.delivery.state[group.state]}`)
    .join(' · ');
}

export function DeliveryReceiptButton({
  message,
  bots,
  onOpen,
}: {
  message: ConversationMessage;
  bots: readonly RosterBot[];
  onOpen(message: ConversationMessage): void;
}) {
  const theme = useDesignTheme();
  const recipients = receiptRecipients(message);
  const t = useStrings();
  const summary = t.delivery.summary(useReceiptCounts(recipients));
  if (recipients.length === 0) return null;
  const ordered = receiptGroups(recipients).flatMap((group) => group.recipients);
  return (
    <Pressable
      testID={`message-delivery-${message.id}`}
      accessibilityRole="button"
      accessibilityLabel={summary}
      hitSlop={space.x3}
      onPress={() => onOpen(message)}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <AvatarStack
        bots={bots}
        items={ordered.map((recipient) => ({
          botSlug: recipient.botSlug,
          ring: receiptColor(theme, recipient.state),
        }))}
      />
    </Pressable>
  );
}

function ReadingDot({ delay }: { delay: number }) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  const mount = useMounted<ViewInstance>(() => {
    if (reduced) return;
    pulse.value = 0.35;
    pulse.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 600, reduceMotion: ReduceMotion.System }), -1, true),
    );
    return () => {
      cancelAnimation(pulse);
      pulse.value = 1;
    };
  }, [reduced, delay, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      ref={mount}
      style={[
        {
          width: space.x1 + 1,
          height: space.x1 + 1,
          borderRadius: radius.round,
          backgroundColor: theme.color.muted,
        },
        style,
      ]}
    />
  );
}

export function ReadingBadge({
  messageId,
  readers,
  bots,
}: {
  messageId: string;
  readers: readonly string[];
  bots: readonly RosterBot[];
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const names = readers
    .map((slug) => bots.find((entry) => entry.slug === slug)?.displayName ?? slug)
    .join(', ');
  return (
    <View
      testID={`message-reading-${messageId}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t.delivery.reading(names)}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingLeft: space.x1,
        paddingRight: space.x4,
        paddingVertical: space.x1,
        borderRadius: radius.round,
        backgroundColor: theme.layer.canvas.fill,
        ...chipShadow(theme.color.fg),
      }}
    >
      <AvatarStack
        bots={bots}
        items={readers.map((botSlug) => ({ botSlug, ring: theme.layer.canvas.fill }))}
      />
      <View style={{ flexDirection: 'row', gap: space.x1 }}>
        {[0, 200, 400].map((delay) => (
          <ReadingDot key={delay} delay={delay} />
        ))}
      </View>
    </View>
  );
}

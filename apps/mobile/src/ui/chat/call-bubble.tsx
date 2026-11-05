import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { BotPortrait, StateRing } from '../bot-avatar';
import { spring } from '../design/motion';
import { glassShadow, useDesignTheme, type DesignTheme } from '../design/theme';
import { callBubble, navigationBar, radius, space, stateRing } from '../design/tokens';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { callBubbleModel, type CallBubbleTone } from './call-model';
import type { CallSessionSnapshot } from './call-session';

const symbols = {
  micOff: { ios: 'mic.slash.fill', android: 'mic_off' },
  phone: { ios: 'phone.fill', android: 'call' },
  hangUp: { ios: 'phone.down.fill', android: 'call_end' },
} as const;

const placement = {
  side: 'right' as 'left' | 'right',
  y: undefined as number | undefined,
};

export function bubbleRingColor(theme: DesignTheme, tone: CallBubbleTone): string {
  switch (tone) {
    case 'listening':
    case 'hearing':
      return theme.color.success;
    case 'thinking':
    case 'speaking':
      return theme.color.accent;
    case 'paused':
      return theme.color.warning;
    case 'ended':
      return theme.color.danger;
    default:
      return theme.color.muted;
  }
}

export function CallBubble({ session }: { session: CallSessionSnapshot }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reduced = useSystemReducedMotion();
  const { client } = useHostSession(session.request.hostId);
  const bot = useHostSnapshot(client).roster?.bots.find(
    (entry) => entry.slug === session.request.slug,
  );
  const [now, setNow] = useState(Date.now());
  const live = session.state.status === 'live';
  const tick = useMounted(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  const model = callBubbleModel(t, session, now);
  const ringColor = bubbleRingColor(theme, model.tone);
  const avatar = Math.round(theme.touch * callBubble.avatarScale);
  const box = avatar + stateRing.inset * 2;
  const edge = space.x4;
  const width = box + edge * 2;
  const capsuleHeight = theme.type.meta.line * callBubble.maxTextScale + space.x1 * 2;
  const height = box + capsuleHeight - callBubble.capsuleOverlap;
  const top = insets.top + space.x3;
  const bottom = window.height - insets.bottom - navigationBar.height - height - space.x3;
  const right = window.width - width;
  const xFor = (side: 'left' | 'right') => (side === 'left' ? 0 : right);
  const initialY = Math.min(Math.max(placement.y ?? insets.top + theme.touch * 2, top), bottom);

  const x = useSharedValue(xFor(placement.side));
  const y = useSharedValue(initialY);
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const opacity = useSharedValue(reduced ? 1 : 0);
  const appear = useMounted(() => {
    scale.value = withSpring(1, spring.spatial.fast);
    opacity.value = withSpring(1, spring.effects.fast);
  }, [scale, opacity]);
  const snap = useMounted(() => {
    x.value = withSpring(placement.side === 'left' ? 0 : right, spring.release);
  }, [x, right]);

  const pulsing = !reduced && (model.tone === 'speaking' || model.tone === 'hearing');

  const open = () =>
    router.push({
      pathname: '/call/[slug]',
      params: {
        slug: session.request.slug,
        ...(session.request.hostId === undefined ? {} : { hostId: session.request.hostId }),
      },
    });
  const settle = (side: 'left' | 'right', finalY: number) => {
    placement.side = side;
    placement.y = finalY;
  };

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pan = Gesture.Pan()
    .minDistance(space.x2)
    .onBegin(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      x.value = startX.value + event.translationX;
      y.value = Math.min(Math.max(startY.value + event.translationY, top), bottom);
    })
    .onEnd((event) => {
      const center = x.value + width / 2 + event.velocityX * 0.1;
      const side = center < window.width / 2 ? 'left' : 'right';
      const target = side === 'left' ? 0 : right;
      x.value = withSpring(target, {
        ...spring.release,
        velocity: event.velocityX,
      });
      runOnJS(settle)(side, y.value);
    });
  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) runOnJS(open)();
  });
  const gesture = Gesture.Exclusive(pan, tap);

  const frame = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const label = t.call.bubble(
    bot?.displayName ?? session.request.slug,
    model.status,
    model.duration,
  );
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={appear}
        testID="call-bubble"
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={open}
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            alignItems: 'center',
          },
          frame,
        ]}
      >
        <View
          ref={tick}
          style={{
            width: box,
            height: box,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {pulsing ? <Halo box={box} color={ringColor} /> : null}
          <View
            style={{
              width: box,
              height: box,
              borderRadius: radius.round,
              backgroundColor: theme.layer.raised.fill,
              boxShadow: glassShadow(theme.scheme),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StateRing
              box={box}
              corner={box / 2}
              color={ringColor}
              running={model.tone === 'connecting' || model.tone === 'thinking'}
            />
            {bot === undefined ? (
              <SystemSymbol name={symbols.phone} size={avatar / 2} color={theme.color.fg} />
            ) : (
              <BotPortrait bot={bot} size={avatar} />
            )}
          </View>
          {model.muted ? (
            <View
              testID="call-bubble-muted"
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: callBubble.badge,
                height: callBubble.badge,
                borderRadius: radius.round,
                backgroundColor: theme.color.fg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SystemSymbol
                name={symbols.micOff}
                size={callBubble.badge * 0.6}
                color={theme.color.base}
              />
            </View>
          ) : null}
        </View>
        <View
          ref={snap}
          style={{
            position: 'absolute',
            top: box - callBubble.capsuleOverlap,
            minWidth: box,
            maxWidth: width,
            alignItems: 'center',
            paddingHorizontal: space.x3,
            paddingVertical: space.x1,
            borderRadius: radius.round,
            backgroundColor: theme.layer.raised.fill,
            boxShadow: glassShadow(theme.scheme),
          }}
        >
          {model.duration === undefined ? (
            <View testID="call-bubble-status" style={{ height: theme.type.meta.line }}>
              <SystemSymbol
                name={model.tone === 'ended' ? symbols.hangUp : symbols.phone}
                size={theme.type.meta.line}
                color={model.tone === 'ended' ? theme.color.danger : theme.color.muted}
              />
            </View>
          ) : (
            <Text
              testID="call-bubble-status"
              variant="meta"
              strong
              numberOfLines={1}
              maxFontSizeMultiplier={callBubble.maxTextScale}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {model.duration}
            </Text>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function Halo({ box, color }: { box: number; color: string }) {
  const halo = useSharedValue(0);
  const mount = useMounted(() => {
    halo.value = 0;
    halo.value = withRepeat(
      withTiming(1, {
        duration: callBubble.pulsePeriod,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
    );
    return () => cancelAnimation(halo);
  }, [halo]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * callBubble.pulseGrowth }],
  }));
  return (
    <Animated.View
      ref={mount}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: box,
          height: box,
          borderRadius: radius.round,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

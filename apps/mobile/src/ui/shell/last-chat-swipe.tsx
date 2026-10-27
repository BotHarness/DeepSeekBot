import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useHostSession } from '../../host/host-session';
import { spring } from '../design/motion';
import { useDesignTheme } from '../design/theme';
import { chatList, edge, lastChatSwipe, radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { Text } from '../primitives/text';
import { useHostDrawerOpen } from './host-drawer';
import { ChevronRightIcon } from './icons';
import { lastChatProgress, opensLastChat } from './last-chat-swipe-model';
import { lastChat, useRecentChats } from './recent-chats';

export function LastChatSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const { hosts } = useHostSession();
  const recent = useRecentChats();
  const drawerOpen = useHostDrawerOpen();
  const chat = lastChat(
    recent,
    hosts.map((host) => host.hostId),
  );
  const travel = useSharedValue(0);
  const armed = useSharedValue(false);
  const [ready, setReady] = useState(false);
  const href = chat?.href;

  const arm = useCallback((next: boolean) => {
    setReady(next);
    if (next) haptic('pull');
  }, []);
  const open = useCallback(() => {
    if (href !== undefined) router.navigate(href);
  }, [href]);

  const pan = Gesture.Pan()
    .enabled(enabled && chat !== undefined && !drawerOpen)
    .activeOffsetX(-lastChatSwipe.start)
    .failOffsetY([-lastChatSwipe.verticalFail, lastChatSwipe.verticalFail])
    .onUpdate((event) => {
      travel.value = Math.min(0, event.translationX);
      const next = lastChatProgress(event.translationX) >= 1;
      if (next !== armed.value) {
        armed.value = next;
        runOnJS(arm)(next);
      }
    })
    .onEnd((event) => {
      if (opensLastChat(event.translationX, event.velocityX)) runOnJS(open)();
    })
    .onFinalize(() => {
      travel.value = withSpring(0, spring.release);
      if (armed.value) {
        armed.value = false;
        runOnJS(setReady)(false);
      }
    });

  const followStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduced ? 0 : travel.value * lastChatSwipe.follow }],
  }));
  const hintStyle = useAnimatedStyle(() => {
    const progress = lastChatProgress(travel.value);
    return {
      opacity: interpolate(progress, [0, 0.4], [0, 1], 'clamp'),
      transform: [
        { translateX: reduced ? 0 : interpolate(progress, [0, 1], [lastChatSwipe.commit, 0]) },
      ],
    };
  });
  const layer = theme.layer.raised;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        <Animated.View style={[{ flex: 1 }, followStyle]}>{children}</Animated.View>
        {chat === undefined ? null : (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: chatList.gutter,
              justifyContent: 'center',
              maxWidth: `${lastChatSwipe.hintShare * 100}%`,
            }}
          >
            <Animated.View
              testID="last-chat-hint"
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x2,
                  paddingLeft: space.x4,
                  paddingRight: space.x3,
                  paddingVertical: space.x3,
                  borderRadius: radius.round,
                  backgroundColor: ready ? theme.color.accent : layer.fill,
                  borderWidth: edge.hairline,
                  borderColor: ready ? theme.color.accent : layer.edge,
                },
                hintStyle,
              ]}
            >
              <Text
                strong
                tone={ready ? 'onAccent' : 'fg'}
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {chat.title}
              </Text>
              <ChevronRightIcon
                color={ready ? theme.color.onAccent : theme.color.muted}
                size={theme.type.body.line}
              />
            </Animated.View>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

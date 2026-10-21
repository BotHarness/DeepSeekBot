import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '../haptics';
import { useDesignTheme, type DesignTheme } from '../design/theme';
import { drawerSpring, space, swipeRow } from '../design/tokens';
import { showActionMenu } from './app-dialog';
import { settleSwipe, swipeArmed } from './swipe-row-model';
import { Text } from './text';

export type SwipeTone = 'accent' | 'warning' | 'neutral';

export type SwipeAction = {
  key: string;
  label: string;
  tone: SwipeTone;
  icon(props: { color: ColorValue; size: number }): ReactNode;
  run(): void;
};

let openRow: (() => void) | undefined;

function colors(theme: DesignTheme, tone: SwipeTone): { fill: string; ink: string } {
  if (tone === 'accent') return { fill: theme.color.accent, ink: theme.color.onAccent };
  if (tone === 'warning')
    return {
      fill: theme.color.warning,
      ink: theme.color[theme.scheme === 'dark' ? 'base' : 'fg'],
    };
  return { fill: theme.layer.canvas.inset, ink: theme.color.fg };
}

export function swipeActionProps(title: string, actions: readonly SwipeAction[]) {
  if (actions.length === 0) return {};
  return {
    onLongPress: () => {
      haptic('menu');
      showActionMenu(
        title,
        actions.map((action) => ({ text: action.label, onPress: action.run })),
      );
    },
    accessibilityActions: actions.map((action) => ({ name: action.key, label: action.label })),
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) =>
      actions.find((action) => action.key === event.nativeEvent.actionName)?.run(),
  };
}

export function SwipeRow({
  actions,
  children,
  testID,
}: {
  actions: readonly SwipeAction[];
  children: ReactNode;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  const armed = useSharedValue(false);
  const [open, setOpen] = useState(false);
  const reveal = swipeRow.actionWidth * actions.length;
  const iconSize = theme.type.body.line;
  const self = useRef<() => void>(() => undefined);

  const settleTo = useCallback(
    (to: number) => {
      'worklet';
      offset.value = reduced
        ? withTiming(to, { duration: 0 })
        : withSpring(to, { ...drawerSpring, reduceMotion: ReduceMotion.System });
    },
    [offset, reduced],
  );
  const closed = useCallback(() => {
    setOpen(false);
    if (openRow === self.current) openRow = undefined;
  }, []);
  const close = useCallback(() => {
    settleTo(0);
    closed();
  }, [settleTo, closed]);
  self.current = close;

  const claim = useCallback(() => {
    if (openRow !== undefined && openRow !== self.current) openRow();
  }, []);
  const opened = useCallback(() => {
    setOpen(true);
    openRow = self.current;
  }, []);
  const run = useCallback(
    (action: SwipeAction | undefined, settle = false) => {
      if (action === undefined) return;
      if (settle) close();
      else closed();
      action.run();
    },
    [close, closed],
  );
  const runFirst = useCallback(() => {
    haptic('submit');
    run(actions[0]);
  }, [actions, run]);
  const crossed = useCallback(() => haptic('menu'), []);

  const pan = Gesture.Pan()
    .enabled(actions.length > 0)
    .activeOffsetX(open ? [-swipeRow.start, swipeRow.start] : -swipeRow.start)
    .failOffsetY([-swipeRow.verticalFail, swipeRow.verticalFail])
    .onStart(() => {
      start.value = offset.value;
      runOnJS(claim)();
    })
    .onUpdate((event) => {
      const next = Math.max(-width.value, Math.min(0, start.value + event.translationX));
      offset.value = next;
      const over = swipeArmed(next, width.value);
      if (over !== armed.value) {
        armed.value = over;
        runOnJS(crossed)();
      }
    })
    .onEnd((event) => {
      armed.value = false;
      const settle = settleSwipe(offset.value, event.velocityX, reveal, width.value);
      if (settle === 'full') {
        settleTo(-width.value);
        runOnJS(runFirst)();
      } else if (settle === 'open') {
        settleTo(-reveal);
        runOnJS(opened)();
      } else {
        settleTo(0);
        runOnJS(closed)();
      }
    });

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const stripStyle = useAnimatedStyle(() => ({ width: Math.max(0, -offset.value) }));
  const first = actions[0];
  return (
    <View
      testID={testID}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}
      style={{ overflow: 'hidden' }}
    >
      {first === undefined ? null : (
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              flexDirection: 'row-reverse',
              backgroundColor: colors(theme, first.tone).fill,
            },
            stripStyle,
          ]}
        >
          {actions.map((action, index) => {
            const { fill, ink } = colors(theme, action.tone);
            return (
              <Pressable
                key={action.key}
                testID={`swipe-action-${action.key}`}
                onPress={() => run(action, true)}
                style={({ pressed }) => ({
                  ...(index === 0 ? { flex: 1, minWidth: swipeRow.actionWidth } : {}),
                  width: index === 0 ? undefined : swipeRow.actionWidth,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.x2,
                  paddingHorizontal: space.x2,
                  backgroundColor: fill,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {action.icon({ color: ink, size: iconSize })}
                <Text
                  variant="meta"
                  strong
                  numberOfLines={2}
                  style={{ color: ink, textAlign: 'center' }}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: theme.color.base }, contentStyle]}>
          {children}
          {open ? (
            <Pressable
              accessible={false}
              onPress={close}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

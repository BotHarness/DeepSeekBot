import { Text } from './primitives/system-text';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  FLOATING_SIZE,
  initialFloating,
  snapFloating,
  type FloatingBounds,
  type FloatingPoint,
} from './floating-position';
import { t } from './strings';
import { useTheme } from './theme';

let remembered: FloatingPoint | undefined;

export function FloatingExit({ onExit }: { onExit(): void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const bounds: FloatingBounds = {
    width: window.width,
    top: insets.top,
    bottom: window.height - insets.bottom,
  };
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const start = snapFloating(remembered ?? initialFloating(bounds), bounds);
  const position = useRef(new Animated.ValueXY(start)).current;
  const origin = useRef(start);
  const [onLeft, setOnLeft] = useState(start.x < bounds.width / 2);
  const [tip, setTip] = useState(false);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            origin.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          position.setValue({
            x: origin.current.x + gesture.dx,
            y: origin.current.y + gesture.dy,
          });
        },
        onPanResponderRelease: (_, gesture) => {
          const next = snapFloating(
            { x: origin.current.x + gesture.dx, y: origin.current.y + gesture.dy },
            boundsRef.current,
          );
          remembered = next;
          setOnLeft(next.x < boundsRef.current.width / 2);
          origin.current = next;
          Animated.spring(position, { toValue: next, useNativeDriver: false }).start();
        },
      }),
    [position],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: position.getTranslateTransform(),
        width: FLOATING_SIZE,
        height: FLOATING_SIZE,
      }}
    >
      <Pressable
        onPress={onExit}
        onLongPress={() => setTip(true)}
        onPressOut={() => setTip(false)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={t.exitWebMode}
        accessibilityHint={t.exitWebModeHint}
        style={({ pressed }) => ({
          width: FLOATING_SIZE,
          height: FLOATING_SIZE,
          borderRadius: FLOATING_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          opacity: pressed ? 1 : 0.88,
          shadowColor: '#000000',
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        })}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10"
            stroke={theme.ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d="M14 8l4 4-4 4M18 12H9"
            stroke={theme.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      {tip ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            height: FLOATING_SIZE,
            justifyContent: 'center',
            ...(onLeft ? { left: FLOATING_SIZE + 8 } : { right: FLOATING_SIZE + 8 }),
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: theme.ink,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: theme.background, fontSize: 14, fontWeight: '600' }}
            >
              {t.exitWebMode}
            </Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

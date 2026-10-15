import { useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { COMPUTER_KEYS, WHEEL_STEP, type ComputerModifier } from '../../host/computer-viewer';
import { buttonColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import {
  ControlsIcon,
  KeyboardHideIcon,
  KeyboardIcon,
  LockIcon,
  MouseButtonIcon,
  MouseIcon,
} from '../shell/icons';
import { t } from '../strings';

export type ComputerTool = 'mouse' | 'keyboard' | 'control';

function useRound() {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, 'secondary', 'canvas');
  return { theme, colors };
}

export function ComputerMousePad({
  onClick,
  onWheel,
}: {
  onClick(button: 'left' | 'right'): void;
  onWheel(dragY: number): void;
}) {
  const { theme, colors } = useRound();
  const big = theme.touch * 1.5;
  const travel = big;
  const knob = useSharedValue(0);
  const sent = useRef(0);

  const roll = (translationY: number) => {
    const pending = translationY - sent.current;
    if (Math.abs(pending) < WHEEL_STEP) return;
    const used = Math.trunc(pending / WHEEL_STEP) * WHEEL_STEP;
    sent.current += used;
    onWheel(used);
  };

  const restart = () => {
    sent.current = 0;
  };

  const wheel = Gesture.Pan()
    .minDistance(1)
    .onStart(() => {
      runOnJS(restart)();
    })
    .onUpdate((event) => {
      knob.value = Math.max(-travel / 2, Math.min(travel / 2, event.translationY));
      runOnJS(roll)(event.translationY);
    })
    .onFinalize(() => {
      knob.value = withSpring(0, { damping: 20, stiffness: 260 });
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: knob.value }] }));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x6,
      }}
    >
      {(['left', 'right'] as const).map((side) => (
        <Pressable
          key={side}
          accessibilityRole="button"
          accessibilityLabel={side === 'left' ? t.computerLeftClick : t.computerRightClick}
          onPress={() => onClick(side)}
          style={({ pressed }) => ({
            width: big,
            height: big,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.pressed : colors.fill,
          })}
        >
          <MouseButtonIcon
            side={side}
            color={colors.label}
            mark={theme.color.accent}
            size={theme.touch * 0.75}
          />
        </Pressable>
      ))}
      <GestureDetector gesture={wheel}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t.computerWheel}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            onWheel(event.nativeEvent.actionName === 'increment' ? -WHEEL_STEP * 3 : WHEEL_STEP * 3)
          }
          style={{
            width: theme.touch * 1.25,
            height: big + travel,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}
        >
          <Animated.View style={knobStyle}>
            <MouseIcon color={colors.label} size={theme.touch * 0.75} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const MODIFIERS: readonly (readonly [ComputerModifier, string, string])[] = [
  ['meta', '⌘', 'Command'],
  ['ctrl', '⌃', 'Control'],
  ['alt', '⌥', 'Option'],
  ['shift', '⇧', 'Shift'],
];

const KEYS: readonly (readonly [string, string, string])[] = [
  [COMPUTER_KEYS.enter, '↵', 'Return'],
  [COMPUTER_KEYS.tab, '⇥', 'Tab'],
  [COMPUTER_KEYS.escape, '⎋', 'Escape'],
];

export function ComputerKeyBar({
  modifiers,
  secret,
  onModifier,
  onKey,
  onSecret,
  onHide,
}: {
  modifiers: readonly ComputerModifier[];
  secret: boolean;
  onModifier(modifier: ComputerModifier): void;
  onKey(key: string): void;
  onSecret(): void;
  onHide(): void;
}) {
  const { theme, colors } = useRound();
  const key =
    (selected: boolean) =>
    ({ pressed }: { pressed: boolean }) => ({
      minWidth: theme.touch,
      height: theme.touch,
      paddingHorizontal: space.x3,
      borderRadius: radius.md,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: selected ? theme.color.accent : pressed ? colors.pressed : colors.fill,
    });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: space.x3 }}
        style={{ flex: 1 }}
      >
        {MODIFIERS.map(([name, glyph, label]) => {
          const on = modifiers.includes(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="switch"
              accessibilityLabel={label}
              accessibilityState={{ checked: on }}
              onPress={() => onModifier(name)}
              style={key(on)}
            >
              <Text strong tone={on ? 'onAccent' : 'fg'}>
                {glyph}
              </Text>
            </Pressable>
          );
        })}
        {KEYS.map(([name, glyph, label]) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onKey(name)}
            style={key(false)}
          >
            <Text strong>{glyph}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={t.computerPasswordKeyboard}
        accessibilityState={{ checked: secret }}
        onPress={onSecret}
        style={key(secret)}
      >
        <LockIcon color={secret ? theme.color.onAccent : colors.label} size={theme.touch / 2} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.computerHideKeyboard}
        onPress={onHide}
        style={key(false)}
      >
        <KeyboardHideIcon color={colors.label} size={theme.touch / 2} />
      </Pressable>
    </View>
  );
}

export function ComputerDock({
  tool,
  onTool,
}: {
  tool: ComputerTool;
  onTool(tool: ComputerTool): void;
}) {
  const { theme } = useRound();
  const items = [
    ['mouse', t.computerMouse, MouseIcon],
    ['keyboard', t.browserKeyboard, KeyboardIcon],
    ['control', t.computerControls, ControlsIcon],
  ] as const;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
      {items.map(([name, label, Icon]) => {
        const on = tool === name;
        const color = on ? theme.color.fg : theme.color.muted;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => onTool(name)}
            style={{
              flex: 1,
              minHeight: theme.touch,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.x1,
            }}
          >
            <Icon color={color} size={theme.touch / 2} focused={on} />
            <Text variant="meta" tone={on ? 'fg' : 'muted'} strong={on}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export function PercentageSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const current = useRef({ value, width, onChange });
  current.current = { value, width, onChange };
  const responder = useMemo(() => {
    let origin = 0;
    const change = (x: number) =>
      current.current.onChange(
        Math.round(Math.max(0, Math.min(100, (x / Math.max(1, current.current.width)) * 100))),
      );
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        origin = event.nativeEvent.locationX;
        change(origin);
      },
      onPanResponderMove: (_, gesture) => change(origin + gesture.dx),
    });
  }, []);
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        onChange(
          Math.max(
            0,
            Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 5 : -5)),
          ),
        )
      }
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      {...responder.panHandlers}
      style={{ minHeight: theme.touch, justifyContent: 'center' }}
    >
      <View
        pointerEvents="none"
        style={{
          height: space.x2,
          backgroundColor: theme.layer.raised.inset,
          borderRadius: radius.round,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            height: '100%',
            width: `${value}%`,
            backgroundColor: theme.color.accent,
            borderRadius: radius.round,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${value}%`,
          width: space.x6,
          height: space.x6,
          marginLeft: -space.x4,
          borderRadius: radius.round,
          backgroundColor: theme.color.accent,
        }}
      />
    </View>
  );
}

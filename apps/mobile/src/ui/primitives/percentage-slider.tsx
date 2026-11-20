import { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { percentageStep } from './percentage-step';

export interface PercentageSliderProps {
  label: string;
  value: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
}

export function PercentageSlider({
  label,
  value,
  max = 100,
  step = 1,
  onChange,
}: PercentageSliderProps) {
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const current = useRef({ value, width, max, step, onChange });
  current.current = { value, width, max, step, onChange };
  const responder = useMemo(() => {
    let origin = 0;
    const change = (x: number) =>
      current.current.onChange(
        percentageStep(
          (x / Math.max(1, current.current.width)) * current.current.max,
          current.current.step,
          current.current.max,
        ),
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
      accessibilityValue={{ min: 0, max, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        onChange(
          percentageStep(
            value + (event.nativeEvent.actionName === 'increment' ? 5 : -5),
            step,
            max,
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
            width: `${(value / max) * 100}%`,
            backgroundColor: theme.color.accent,
            borderRadius: radius.round,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${(value / max) * 100}%`,
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

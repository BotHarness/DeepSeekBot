import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useDesignTheme } from '../design/theme';
import { rowGlyph } from '../design/tokens';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { useTheme, type Theme } from '../theme';
import type { RowStatus } from './conversations';

type Shown = Exclude<RowStatus, 'none'>;

const STROKE = { strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function colorOf(theme: Theme, status: Shown): string {
  switch (status) {
    case 'needs-you':
      return theme.warning;
    case 'blocked':
      return theme.danger;
    case 'done':
    case 'paused':
      return theme.inkSoft;
    default:
      return theme.ink;
  }
}

function shape(status: Shown, color: string, cut: string): ReactElement {
  switch (status) {
    case 'working':
      return (
        <>
          <Circle
            cx={8}
            cy={8}
            r={6.2}
            fill="none"
            stroke={color}
            strokeOpacity={0.18}
            {...STROKE}
          />
          <Path d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2" fill="none" stroke={color} {...STROKE} />
        </>
      );
    case 'needs-you':
      return (
        <>
          <Circle cx={8} cy={8} r={6.2} fill="none" stroke={color} {...STROKE} />
          <Circle cx={8} cy={8} r={3} fill={color} />
        </>
      );
    case 'blocked':
      return (
        <>
          <Circle cx={8} cy={8} r={7} fill={color} />
          <Path d="M8 4.3v4.4" fill="none" stroke={cut} {...STROKE} />
          <Circle cx={8} cy={11.3} r={1.05} fill={cut} />
        </>
      );
    case 'done-unread':
      return (
        <>
          <Circle cx={8} cy={8} r={7} fill={color} />
          <Path d="M5 8.2l2 2 4-4.3" fill="none" stroke={cut} {...STROKE} />
        </>
      );
    case 'done':
      return (
        <Path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke={color} {...STROKE} strokeWidth={1.6} />
      );
    case 'paused':
      return (
        <Path
          d="M10.8 12.6A5.6 5.6 0 0 1 6.4 2.4a5.6 5.6 0 1 0 6.9 8.1 5.6 5.6 0 0 1-2.5 2.1z"
          fill={color}
        />
      );
  }
}

export function RowStatusGlyph({ status }: { status: RowStatus }) {
  const theme = useTheme();
  const canvas = useDesignTheme().layer.canvas.fill;
  const reduced = useReducedMotion();
  const spin = status === 'working' && !reduced;
  const turn = useSharedValue(0);
  const mount = useMounted<Svg>(() => {
    if (!spin) return;
    turn.value = 0;
    turn.value = withRepeat(
      withTiming(360, {
        duration: rowGlyph.period,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
    );
    return () => cancelAnimation(turn);
  }, [spin, turn]);
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  if (status === 'none') return null;
  return (
    <Animated.View
      testID={`row-status-${status}`}
      accessibilityRole="image"
      accessibilityLabel={t.rowStatus[status]}
      style={[{ width: rowGlyph.size, height: rowGlyph.size, flexShrink: 0 }, rotation]}
    >
      <Svg ref={mount} width={rowGlyph.size} height={rowGlyph.size} viewBox="0 0 16 16">
        {shape(status, colorOf(theme, status), canvas)}
      </Svg>
    </Animated.View>
  );
}

import { memo, useState } from 'react';
import type { TextInstance } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { streamReveal } from '../design/tokens';
import { useMounted } from '../mounted';
import { appendTextReveal, type RevealGlyph } from './fading-text-model';
import { InlineText } from './text';

const AnimatedInlineText = Animated.createAnimatedComponent(InlineText);

const Glyph = memo(function Glyph({
  glyph,
  clock,
  color,
}: {
  glyph: RevealGlyph;
  clock: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    top: 0,
    color: interpolateColor(
      Math.min(1, Math.max(0, (clock.value - glyph.at - glyph.delay) / streamReveal.duration)),
      [0, 1],
      [color + '00', color],
    ),
  }));
  return <AnimatedInlineText style={style}>{glyph.text}</AnimatedInlineText>;
});

export function FadingText({ text, color }: { text: string; color: string }) {
  const reduced = useReducedMotion();
  const [previous, setPrevious] = useState(() => appendTextReveal(undefined, text, Date.now()));
  const current = previous.text === text ? previous : appendTextReveal(previous, text, Date.now());
  if (previous !== current) setPrevious(current);
  const clock = useSharedValue(Date.now());
  const mount = useMounted<TextInstance>(() => {
    const now = current.glyphs.at(-1)?.at ?? Date.now();
    const duration = streamReveal.duration + streamReveal.stagger;
    clock.value = now;
    clock.value = withTiming(now + duration, {
      duration,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.System,
    });
    return () => cancelAnimation(clock);
  }, [current, clock]);
  if (reduced) return text;
  return (
    <InlineText ref={mount}>
      {current.prefix}
      {current.glyphs.map((glyph) => (
        <Glyph key={glyph.offset} glyph={glyph} clock={clock} color={color} />
      ))}
    </InlineText>
  );
}

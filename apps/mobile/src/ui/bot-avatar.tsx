import { useMemo } from 'react';
import { Image as CachedImage } from 'expo-image';
import { Image, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { avatarSvg } from '../../../../packages/core/src/bots/avatar-appearance';
import { resolvedAvatarRecipe } from '../../../../packages/core/src/bots/primary-color';
import type { RosterBot } from '../host/client';
import { stateRing } from './design/tokens';
import { useMounted } from './mounted';
import { stateColor, useTheme } from './theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function StateRing({
  box,
  corner,
  color,
  running,
}: {
  box: number;
  corner: number;
  color: string;
  running: boolean;
}) {
  const reduced = useReducedMotion();
  const animate = running && !reduced;
  const half = stateRing.width / 2;
  const side = box - stateRing.width;
  const rx = Math.min(side / 2, Math.max(0, corner - half));
  const perimeter = 4 * (side - 2 * rx) + 2 * Math.PI * rx;
  const offset = useSharedValue(0);
  const mount = useMounted<Svg>(() => {
    if (!animate) return;
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(-perimeter, {
        duration: stateRing.period,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
    );
    return () => cancelAnimation(offset);
  }, [animate, perimeter, offset]);
  const runProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  const geometry = { x: half, y: half, width: side, height: side, rx, ry: rx, fill: 'none' };
  return (
    <Svg
      ref={mount}
      width={box}
      height={box}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      {running ? (
        <>
          <Rect
            {...geometry}
            stroke={color}
            strokeOpacity={animate ? 0.2 : 1}
            strokeWidth={stateRing.width}
          />
          {animate ? (
            <AnimatedRect
              {...geometry}
              stroke={color}
              strokeWidth={stateRing.width}
              strokeLinecap="round"
              strokeDasharray={[perimeter * stateRing.segment, perimeter * (1 - stateRing.segment)]}
              animatedProps={runProps}
            />
          ) : null}
        </>
      ) : (
        <Rect {...geometry} stroke={color} strokeWidth={stateRing.width} />
      )}
    </Svg>
  );
}

export function BotAvatar({
  bot,
  size,
  ring = true,
  corner,
}: {
  bot: RosterBot;
  size: number;
  ring?: boolean;
  corner?: number;
}) {
  const theme = useTheme();
  const svg = useMemo(() => {
    if (bot.avatarUrl !== undefined) return undefined;
    const recipe = resolvedAvatarRecipe({
      slug: bot.slug,
      displayName: bot.displayName,
      appearance: bot.appearance,
      avatarSeed: bot.avatarSeed,
    });
    return recipe === undefined ? undefined : avatarSvg(recipe);
  }, [bot.avatarUrl, bot.slug, bot.displayName, bot.appearance, bot.avatarSeed]);
  const frame = ring ? stateRing.inset * 2 : 0;
  const box = size + frame;
  const outerCorner = corner === undefined ? box / 2 : corner + frame / 2;
  const running = bot.state === 'thinking' || bot.state === 'working';
  return (
    <View
      style={{
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: bot.paused ? 0.5 : 1,
      }}
    >
      {ring && bot.state !== 'idle' ? (
        <StateRing
          box={box}
          corner={outerCorner}
          color={running ? theme.accent : stateColor(theme, bot.state)}
          running={running}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: corner ?? size / 2,
          overflow: 'hidden',
          backgroundColor: theme.border,
        }}
      >
        {bot.avatarUrl !== undefined ? (
          <Image
            source={{ uri: bot.avatarUrl, headers: bot.avatarHeaders }}
            style={{ width: size, height: size }}
          />
        ) : svg !== undefined ? (
          <CachedImage
            source={{ uri: `data:image/svg+xml;base64,${btoa(svg)}` }}
            cachePolicy="memory"
            contentFit="contain"
            style={{ width: size, height: size }}
          />
        ) : null}
      </View>
    </View>
  );
}

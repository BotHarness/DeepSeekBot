import { useMemo } from 'react';
import { Image as CachedImage } from 'expo-image';
import { Image, View } from 'react-native';

import { avatarSvg } from '../../../../packages/core/src/bots/avatar-appearance';
import { resolvedAvatarRecipe } from '../../../../packages/core/src/bots/primary-color';
import type { RosterBot } from '../host/client';
import { stateColor, useTheme } from './theme';

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
  const frame = ring ? 6 : 0;
  return (
    <View
      style={{
        width: size + frame,
        height: size + frame,
        borderRadius: corner === undefined ? (size + frame) / 2 : corner + frame / 2,
        borderWidth: ring ? 2 : 0,
        borderColor: bot.state === 'idle' ? 'transparent' : stateColor(theme, bot.state),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: bot.paused ? 0.5 : 1,
      }}
    >
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

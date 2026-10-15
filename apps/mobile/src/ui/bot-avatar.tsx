import { useMemo } from 'react';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { avatarSvg } from '../../../../packages/core/src/bots/avatar-appearance';
import { resolvedAvatarRecipe } from '../../../../packages/core/src/bots/primary-color';
import type { RosterBot } from '../host/client';
import { stateColor, useTheme } from './theme';

export function BotAvatar({
  bot,
  size,
  ring = true,
}: {
  bot: RosterBot;
  size: number;
  ring?: boolean;
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
        borderRadius: (size + frame) / 2,
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
          borderRadius: size / 2,
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
          <SvgXml xml={svg} width={size} height={size} />
        ) : null}
      </View>
    </View>
  );
}

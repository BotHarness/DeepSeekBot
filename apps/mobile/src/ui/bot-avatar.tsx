import { useMemo } from 'react';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { avatarSvg } from '../../../../packages/core/src/bots/avatar-appearance';
import { resolvedAvatarRecipe } from '../../../../packages/core/src/bots/primary-color';
import type { RosterBot } from '../host/client';
import { stateColor, useTheme } from './theme';

export function BotAvatar({ bot, size }: { bot: RosterBot; size: number }) {
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
  const ring = stateColor(theme, bot.state);
  return (
    <View
      style={{
        width: size + 6,
        height: size + 6,
        borderRadius: (size + 6) / 2,
        borderWidth: 2,
        borderColor: bot.state === 'idle' ? 'transparent' : ring,
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

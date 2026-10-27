import { Image as CachedImage } from 'expo-image';
import { useMemo } from 'react';
import { Image, View } from 'react-native';

import {
  avatarSvg,
  seededAvatarFor,
} from '../../../../../packages/core/src/bots/avatar-appearance';
import type { BotAvatarChoice } from '../../host/bot-creation';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import { useDesignTheme } from '../design/theme';
import { creationAvatar, space } from '../design/tokens';
import { Button } from '../primitives/creation-button';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { creationCopy as copy } from './bot-creation-copy';

export function randomAvatarSeed() {
  return Math.random().toString(36).slice(2, 12);
}

export function CreationAvatarPreview({
  avatar,
  name,
  imported,
  size = creationAvatar.size,
}: {
  avatar: BotAvatarChoice | undefined;
  name: string;
  imported: boolean;
  size?: number;
}) {
  const theme = useDesignTheme();
  const seed = avatar?.kind === 'generated' ? avatar.seed : imported ? undefined : name || 'Bot';
  const svg = useMemo(
    () => (seed === undefined ? undefined : avatarSvg(seededAvatarFor(seed, undefined))),
    [seed],
  );
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={copy.avatar}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      {avatar?.kind === 'photo' ? (
        <Image source={{ uri: avatar.image }} style={{ width: size, height: size }} />
      ) : svg ? (
        <CachedImage
          source={{ uri: `data:image/svg+xml;base64,${btoa(svg)}` }}
          cachePolicy="memory"
          contentFit="contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <SystemSymbol
          name={{ ios: 'shippingbox', android: 'inventory_2' }}
          size={size / 2.5}
          color={theme.color.muted}
        />
      )}
    </View>
  );
}

export function CreationAvatar({
  avatar,
  name,
  imported,
  disabled,
  onChange,
}: {
  avatar: BotAvatarChoice | undefined;
  name: string;
  imported: boolean;
  disabled: boolean;
  onChange(avatar: BotAvatarChoice): void;
}) {
  const choosePhoto = async () => {
    const image = await pickAvatarImage().catch(() => undefined);
    if (image) onChange({ kind: 'photo', image });
  };
  return (
    <View style={{ alignItems: 'center', gap: space.x3 }}>
      <CreationAvatarPreview avatar={avatar} name={name} imported={imported} />
      {imported && !avatar ? (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {copy.sourceAvatar}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: space.x3 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.shuffleAvatar}
            testID="create-bot-avatar-shuffle"
            disabled={disabled}
            onPress={() => onChange({ kind: 'generated', seed: randomAvatarSeed() })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={copy.photoAvatar}
            testID="create-bot-avatar-photo"
            disabled={disabled}
            onPress={() => void choosePhoto()}
          />
        </View>
      </View>
    </View>
  );
}

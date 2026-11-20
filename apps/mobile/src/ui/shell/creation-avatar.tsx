import { Image as CachedImage } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { avatarSvg } from '../../../../../packages/core/src/bots/avatar-appearance';
import { creationAvatarRecipe, randomAvatarSeed } from '@botharness/host-client/bot-avatar-choice';
import { isTiltiesAvatar, randomTiltiesAvatar } from '@botharness/host-client/tilties-avatars';
import type { BotAvatarChoice } from '@botharness/host-client/bot-creation';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import { useDesignTheme } from '../design/theme';
import { creationAvatar, space } from '../design/tokens';
import { Button } from '../primitives/creation-button';
import { Segmented } from '../primitives/segmented';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { creationCopy as copy } from './bot-creation-copy';
import { useStrings } from '../strings';

export function CreationAvatarPreview({
  avatar,
  imported,
  size = creationAvatar.size,
  testID,
}: {
  avatar: BotAvatarChoice | undefined;
  name: string;
  imported: boolean;
  size?: number;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const svg = useMemo(
    () =>
      (imported && !avatar) || avatar?.kind === 'photo'
        ? undefined
        : avatarSvg(creationAvatarRecipe(avatar)),
    [avatar, imported],
  );
  return (
    <View
      testID={testID}
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
        <CachedImage
          source={{ uri: avatar.image }}
          cachePolicy="memory"
          contentFit="cover"
          style={{ width: size, height: size }}
        />
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
  const t = useStrings();
  const theme = useDesignTheme();
  const tiltiesImage =
    avatar?.kind === 'photo' && isTiltiesAvatar(avatar.image) ? avatar.image : undefined;
  const shuffle = () =>
    onChange(
      tiltiesImage === undefined
        ? { kind: 'generated', seed: randomAvatarSeed() }
        : { kind: 'photo', image: randomTiltiesAvatar(tiltiesImage) },
    );
  const choosePhoto = async () => {
    const image = await pickAvatarImage().catch(() => undefined);
    if (image) onChange({ kind: 'photo', image });
  };
  return (
    <View style={{ alignItems: 'center', gap: space.x3 }}>
      <CreationAvatarPreview
        avatar={avatar}
        name={name}
        imported={imported}
        testID="create-bot-avatar-preview"
      />
      {imported ? null : (
        <Segmented
          label={t.avatarEditor.style}
          value={tiltiesImage === undefined ? 'pixel' : 'tilties'}
          options={[
            { value: 'pixel', label: t.avatarEditor.pixel },
            { value: 'tilties', label: t.avatarEditor.tilties },
          ]}
          disabled={disabled}
          onChange={(style) =>
            onChange(
              style === 'tilties'
                ? { kind: 'photo', image: randomTiltiesAvatar() }
                : { kind: 'generated', seed: randomAvatarSeed() },
            )
          }
        />
      )}
      {imported && !avatar ? (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {copy.sourceAvatar}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: theme.largeText ? 'column' : 'row',
          alignSelf: 'stretch',
          gap: space.x3,
        }}
      >
        <View style={{ flex: theme.largeText ? undefined : 1 }}>
          <Button
            label={copy.shuffleAvatar}
            testID="create-bot-avatar-shuffle"
            disabled={disabled}
            onPress={shuffle}
          />
        </View>
        <View style={{ flex: theme.largeText ? undefined : 1 }}>
          <Button
            label={copy.photoAvatar}
            testID="create-bot-avatar-photo"
            disabled={disabled}
            onPress={() => void choosePhoto()}
          />
        </View>
        <View style={{ flex: theme.largeText ? undefined : 1 }}>
          <Button
            label={t.avatarEditor.title}
            testID="create-bot-avatar-customize"
            disabled={disabled}
            onPress={() => router.push('/create-bot-avatar')}
          />
        </View>
      </View>
    </View>
  );
}

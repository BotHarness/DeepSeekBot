import { Image as CachedImage } from 'expo-image';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import {
  avatarSvg,
  type AvatarRecipe,
} from '../../../../../packages/core/src/bots/avatar-appearance';
import { creationAvatarRecipe, randomAvatarSeed } from '@botharness/host-client/bot-avatar-choice';
import {
  isTiltiesAvatar,
  randomTiltiesAvatar,
  TILTIES_PORTRAITS,
} from '@botharness/host-client/tilties-avatars';
import type { BotAvatarChoice } from '@botharness/host-client/bot-creation';
import { avatarFamilyOptions } from '../../host/avatar-customization';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import { avatarBackdrop } from '../avatar-backdrop';
import { useDesignTheme } from '../design/theme';
import { creationAvatar, edge, radius, space } from '../design/tokens';
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
        : avatarSvg(creationAvatarRecipe(avatar), { squareBackdrop: true }),
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
        backgroundColor: (svg && avatarBackdrop(svg)) ?? theme.layer.raised.fill,
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
          contentFit="cover"
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

type Gallery = 'tilties' | 'pixel';
type Preset = {
  id: string;
  label: string;
  uri: string;
  avatar: BotAvatarChoice;
  backdrop: string | undefined;
};

const tiltiesPresets = TILTIES_PORTRAITS.map((portrait) => ({
  portrait,
  avatar: { kind: 'photo', image: portrait.image } as const,
}));
const pixelPresets = avatarFamilyOptions.illustrated.presets.map((recipe, index) => {
  const svg = avatarSvg(recipe, { squareBackdrop: true });
  return {
    id: String(index + 1),
    number: index + 1,
    recipe,
    uri: 'data:image/svg+xml;base64,' + btoa(svg),
    backdrop: avatarBackdrop(svg),
  };
});

function initialGallery(avatar: BotAvatarChoice | undefined): Gallery {
  if (avatar?.kind === 'recipe') return 'pixel';
  if (avatar?.kind === 'generated' && avatar.origin !== 'initial') return 'pixel';
  return 'tilties';
}

function recipeKey(recipe: AvatarRecipe): string {
  return JSON.stringify(recipe, (_key, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const entries = Object.entries(value);
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries);
  });
}

function sameRecipe(avatar: BotAvatarChoice | undefined, recipe: AvatarRecipe): boolean {
  return (
    avatar?.kind === 'recipe' &&
    (avatar.recipe === recipe || recipeKey(avatar.recipe) === recipeKey(recipe))
  );
}

const PresetTile = memo(function PresetTile({
  preset,
  selected,
  disabled,
  onChoose,
}: {
  preset: Preset;
  selected: boolean;
  disabled: boolean;
  onChoose(avatar: BotAvatarChoice): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={preset.id}
      accessibilityRole="radio"
      accessibilityLabel={preset.label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => onChoose(preset.avatar)}
      android_ripple={{ color: theme.layer.raised.pressed, borderless: false }}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1,
        minHeight: theme.touch,
        padding: space.x1,
        borderRadius: radius.round,
        borderWidth: edge.focus,
        borderColor: selected ? theme.color.accent : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius.round,
          overflow: 'hidden',
          backgroundColor: preset.backdrop ?? theme.layer.raised.fill,
        }}
      >
        <CachedImage
          source={{ uri: preset.uri }}
          cachePolicy="memory"
          contentFit="cover"
          style={{ flex: 1 }}
        />
      </View>
    </Pressable>
  );
});

function PresetGrid({
  presets,
  isSelected,
  disabled,
  onChoose,
}: {
  presets: readonly Preset[];
  isSelected(preset: Preset): boolean;
  disabled: boolean;
  onChoose(avatar: BotAvatarChoice): void;
}) {
  const theme = useDesignTheme();
  const columns = theme.largeText ? creationAvatar.largeColumns : creationAvatar.columns;
  const rows: Preset[][] = [];
  for (let index = 0; index < presets.length; index += columns)
    rows.push(presets.slice(index, index + columns));
  return (
    <View accessibilityRole="radiogroup" style={{ alignSelf: 'stretch', gap: space.x2 }}>
      {rows.map((row) => (
        <View key={row[0]?.id} style={{ flexDirection: 'row', gap: space.x2 }}>
          {row.map((preset) => (
            <PresetTile
              key={preset.id}
              preset={preset}
              selected={isSelected(preset)}
              disabled={disabled}
              onChoose={onChoose}
            />
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={'gap-' + index} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function CreationAvatar({
  avatar,
  name,
  imported,
  disabled,
  onChange,
  children,
}: {
  avatar: BotAvatarChoice | undefined;
  name: string;
  imported: boolean;
  disabled: boolean;
  onChange(avatar: BotAvatarChoice): void;
  children?: ReactNode;
}) {
  const t = useStrings();
  const [gallery, setGallery] = useState<Gallery>(() => initialGallery(avatar));
  const choosePhoto = async () => {
    const image = await pickAvatarImage().catch(() => undefined);
    if (image) onChange({ kind: 'photo', image });
  };
  const presets: Preset[] =
    gallery === 'tilties'
      ? tiltiesPresets.map(({ portrait, avatar: choice }) => ({
          id: 'create-bot-avatar-tilties-' + portrait.id,
          label: t.avatarEditor.tiltiesName(portrait.en, portrait.zh),
          uri: portrait.image,
          backdrop: undefined,
          avatar: choice,
        }))
      : pixelPresets.map((preset) => ({
          id: 'create-bot-avatar-pixel-' + preset.id,
          label: t.avatarEditor.preset(preset.number),
          uri: preset.uri,
          backdrop: preset.backdrop,
          avatar: { kind: 'recipe', recipe: preset.recipe },
        }));
  const isSelected = (preset: Preset) =>
    preset.avatar.kind === 'photo'
      ? avatar?.kind === 'photo' && avatar.image === preset.avatar.image
      : preset.avatar.kind === 'recipe' && sameRecipe(avatar, preset.avatar.recipe);
  const randomize = () =>
    onChange(
      gallery === 'tilties'
        ? {
            kind: 'photo',
            image: randomTiltiesAvatar(
              avatar?.kind === 'photo' && isTiltiesAvatar(avatar.image) ? avatar.image : undefined,
            ),
          }
        : { kind: 'generated', seed: randomAvatarSeed() },
    );
  return (
    <View style={{ gap: space.x4 }}>
      <View style={{ alignItems: 'center', gap: space.x3 }}>
        <CreationAvatarPreview
          avatar={avatar}
          name={name}
          imported={imported}
          testID="create-bot-avatar-preview"
        />
        {imported && !avatar ? (
          <Text tone="muted" style={{ textAlign: 'center' }}>
            {copy.sourceAvatar}
          </Text>
        ) : null}
      </View>
      {children}
      <Button
        label={copy.photoAvatar}
        testID="create-bot-avatar-photo"
        symbol="photo"
        disabled={disabled}
        onPress={() => void choosePhoto()}
      />
      <View style={{ alignSelf: 'stretch' }}>
        <Segmented<Gallery>
          label={t.avatarEditor.style}
          value={gallery}
          options={[
            { value: 'tilties', label: t.avatarEditor.tilties },
            { value: 'pixel', label: t.avatarEditor.pixel },
          ]}
          disabled={disabled}
          testID="create-bot-avatar-gallery"
          onChange={setGallery}
        />
      </View>
      <Button
        label={t.avatarEditor.random}
        testID="create-bot-avatar-random"
        symbol="refresh"
        disabled={disabled}
        onPress={randomize}
      />
      <PresetGrid
        presets={presets}
        isSelected={isSelected}
        disabled={disabled}
        onChoose={onChange}
      />
    </View>
  );
}

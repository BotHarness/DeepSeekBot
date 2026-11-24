import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { memo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { TILTIES_PORTRAITS } from '@botharness/host-client/tilties-avatars';
import { useDesignTheme } from '../design/theme';
import { avatarEditor, edge, radius, space } from '../design/tokens';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { CheckIcon } from './icons';

type Portrait = (typeof TILTIES_PORTRAITS)[number];

const TiltiesTile = memo(function TiltiesTile({
  portrait,
  selected,
  onChoose,
}: {
  portrait: Portrait;
  selected: boolean;
  onChoose(image: string): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const name = t.avatarEditor.tiltiesName(portrait.en, portrait.zh);
  return (
    <Pressable
      testID={`tilties-avatar-${portrait.id}`}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={() => onChoose(portrait.image)}
      android_ripple={{ color: theme.layer.raised.pressed }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: theme.touch,
        alignItems: 'center',
        padding: space.x2,
        gap: space.x2,
        borderRadius: radius.lg,
        borderWidth: edge.hairline,
        borderColor: selected ? theme.color.accent : theme.color.borderField,
        backgroundColor: pressed
          ? theme.layer.raised.pressed
          : selected
            ? theme.layer.raised.chosen
            : theme.layer.raised.fill,
      })}
    >
      <Image
        source={{ uri: portrait.image }}
        cachePolicy="memory"
        contentFit="contain"
        style={{ width: avatarEditor.tile, height: avatarEditor.tile }}
      />
      <Text variant="meta" style={{ textAlign: 'center' }}>
        {name}
      </Text>
      <View style={{ height: theme.type.meta.line }}>
        {selected ? <CheckIcon color={theme.color.accent} size={theme.type.meta.line} /> : null}
      </View>
    </Pressable>
  );
});

export function TiltiesPicker({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave(image: string): Promise<boolean>;
  onClose(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [image, setImage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const columns = theme.largeText ? avatarEditor.largeColumns : avatarEditor.columns;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    let saved = false;
    try {
      saved = await onSave(image);
    } catch {
      saved = false;
    }
    setBusy(false);
    setFailed(!saved);
    if (saved) onClose();
  };
  return (
    <View
      collapsable={false}
      testID="tilties-picker"
      style={{ flex: 1, backgroundColor: theme.color.base }}
    >
      <Stack.Screen
        options={{
          title: t.avatarEditor.title,
          headerRight: () => (
            <SheetSaveButton
              testID="avatar-editor-save"
              label={t.done}
              busy={busy}
              disabled={false}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <FlatList
        key={columns}
        data={TILTIES_PORTRAITS}
        keyExtractor={(portrait) => portrait.id}
        numColumns={columns}
        pointerEvents={busy ? 'none' : 'auto'}
        contentContainerStyle={{ padding: space.x4, gap: space.x3, paddingBottom: space.x6 }}
        columnWrapperStyle={columns > 1 ? { gap: space.x3 } : undefined}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', gap: space.x3, paddingBottom: space.x2 }}>
            <View
              accessibilityRole="image"
              accessibilityLabel={t.avatarEditor.preview}
              testID="avatar-editor-preview"
              style={{ borderRadius: radius.round, overflow: 'hidden' }}
            >
              <Image
                source={{ uri: image }}
                cachePolicy="memory"
                contentFit="cover"
                style={{ width: avatarEditor.preview, height: avatarEditor.preview }}
              />
            </View>
            {failed ? <Text tone="danger">{t.avatarEditor.saveFailed}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <TiltiesTile portrait={item} selected={item.image === image} onChoose={setImage} />
        )}
      />
    </View>
  );
}

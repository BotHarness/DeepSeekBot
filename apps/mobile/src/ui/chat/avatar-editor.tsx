import { Image } from 'expo-image';
import {
  DEFAULT_TILTIES_COLLECTION,
  TILTIES_COLLECTIONS,
  type TiltiesCollectionId,
} from '@botharness/host-client/tilties-avatars';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@botharness/host-client/bot-settings';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export interface AvatarActions {
  pick(): Promise<string | undefined>;
  save(avatar: string | null): Promise<void>;
}

export function useAvatarEditor({ pick, save }: AvatarActions) {
  const t = useStrings();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const change = async (choice: 'photo' | { image: string | null }) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      let avatar: string | null;
      if (choice === 'photo') {
        let picked: string | undefined;
        try {
          picked = await pick();
        } catch {
          setError(t.avatarPickFailed);
          return;
        }
        if (picked === undefined) return;
        avatar = picked;
      } else {
        avatar = choice.image;
      }
      try {
        await save(avatar);
      } catch (failure) {
        setError(`${t.avatarSaveFailed} ${errorText(failure)}`);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    choose: (image?: string) => change(image === undefined ? 'photo' : { image }),
    remove: () => change({ image: null }),
  };
}

type AvatarEditor = ReturnType<typeof useAvatarEditor>;

export function EditableAvatar({
  editor,
  children,
  corner,
  testID,
  label,
}: {
  editor: AvatarEditor;
  children: ReactNode;
  corner: number;
  testID: string;
  label?: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ?? t.avatarChange}
      accessibilityState={{ disabled: editor.busy, busy: editor.busy }}
      disabled={editor.busy}
      onPress={() => void editor.choose()}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        borderRadius: corner,
        overflow: 'hidden',
        opacity: pressed || editor.busy ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function AvatarSettings({
  editor,
  hasAvatar,
  portrait,
  testID,
  on = 'sheet',
  showTilties = false,
}: {
  editor: AvatarEditor;
  hasAvatar: boolean;
  portrait: ReactNode;
  testID: string;
  on?: LayerName;
  showTilties?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [tiltiesOpen, setTiltiesOpen] = useState(false);
  const [collection, selectCollection] = useState<TiltiesCollectionId>(DEFAULT_TILTIES_COLLECTION);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const current = TILTIES_COLLECTIONS.find(({ id }) => id === collection);
  const portraits = current?.portraits ?? [];
  return (
    <View style={{ alignSelf: 'stretch', gap: space.x2 }}>
      <SettingsSection title={t.avatarTitle} on={on}>
        <SettingsRow
          on={on}
          testID={`${testID}-change`}
          title={t.avatarChange}
          leading={portrait}
          control={{ kind: 'chevron' }}
          onPress={editor.busy ? undefined : () => void editor.choose()}
        />
        {showTilties ? (
          <SettingsRow
            on={on}
            testID={`${testID}-tilties`}
            title={t.avatarEditor.tilties}
            expanded={tiltiesOpen}
            onPress={editor.busy ? undefined : () => setTiltiesOpen(!tiltiesOpen)}
          />
        ) : null}
        {hasAvatar ? (
          <View style={{ borderTopWidth: edge.hairline, borderTopColor: theme.layer[on].divider }}>
            <SettingsRow
              on={on}
              testID={`${testID}-remove`}
              title={t.avatarRemove}
              onPress={editor.busy ? undefined : () => void editor.remove()}
            />
          </View>
        ) : null}
      </SettingsSection>
      {showTilties && tiltiesOpen ? (
        <View style={{ gap: space.x3 }}>
          <SettingsSection on={on}>
            <SettingsRow
              on={on}
              testID="tilties-collections"
              title={t.avatarEditor.collections}
              detail={current && t.avatarEditor.tiltiesName(current.en, current.zh)}
              disclosure
              expanded={collectionsOpen}
              onPress={editor.busy ? undefined : () => setCollectionsOpen(!collectionsOpen)}
            />
            {collectionsOpen
              ? TILTIES_COLLECTIONS.map(({ id, en, zh }) => (
                  <SettingsRow
                    key={id}
                    on={on}
                    testID={`tilties-collection-${id}`}
                    title={t.avatarEditor.tiltiesName(en, zh)}
                    selected={id === collection}
                    control={id === collection ? { kind: 'check' } : undefined}
                    onPress={() => {
                      selectCollection(id);
                      setCollectionsOpen(false);
                    }}
                  />
                ))
              : null}
          </SettingsSection>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
            {!collectionsOpen &&
              portraits.map(({ id, en, zh, image }) => (
                <Pressable
                  key={id}
                  testID={`tilties-avatar-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t.avatarEditor.tiltiesName(en, zh)}
                  accessibilityState={{ disabled: editor.busy }}
                  disabled={editor.busy}
                  onPress={() => void editor.choose(image)}
                  android_ripple={{ color: pressTint(theme.color.fg) }}
                  style={({ pressed }) => ({
                    width: theme.touch,
                    height: theme.touch,
                    borderRadius: theme.touch / 2,
                    overflow: 'hidden',
                    opacity: pressed || editor.busy ? 0.7 : 1,
                  })}
                >
                  <Image source={{ uri: image }} contentFit="cover" style={{ flex: 1 }} />
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}
      {editor.error === undefined ? null : (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {editor.error}
        </Text>
      )}
    </View>
  );
}

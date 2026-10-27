import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '../../host/bot-settings';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';
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
  const change = async (choose: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      let avatar: string | null = null;
      if (choose) {
        let picked: string | undefined;
        try {
          picked = await pick();
        } catch {
          setError(t.avatarPickFailed);
          return;
        }
        if (picked === undefined) return;
        avatar = picked;
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
  return { busy, error, choose: () => change(true), remove: () => change(false) };
}

type AvatarEditor = ReturnType<typeof useAvatarEditor>;

export function EditableAvatar({
  editor,
  children,
  corner,
  testID,
}: {
  editor: AvatarEditor;
  children: ReactNode;
  corner: number;
  testID: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t.avatarChange}
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
}: {
  editor: AvatarEditor;
  hasAvatar: boolean;
  portrait: ReactNode;
  testID: string;
  on?: LayerName;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View style={{ alignSelf: 'stretch', gap: space.x2 }}>
      <SettingsSection title={t.avatarTitle} on={on}>
        <SettingsRow
          on={on}
          testID={`${testID}-change`}
          title={t.avatarChange}
          leading={portrait}
          trailing={<ChevronRightIcon color={theme.color.muted} size={theme.type.body.line} />}
          onPress={editor.busy ? undefined : () => void editor.choose()}
        />
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
      {editor.error === undefined ? null : (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {editor.error}
        </Text>
      )}
    </View>
  );
}

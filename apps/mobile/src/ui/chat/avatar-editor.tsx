import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { AvatarRecipe } from '../../../../../packages/core/src/bots/avatar-appearance';
import { errorText } from '@botharness/host-client/bot-settings';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Button } from '../primitives/button';
import { useStrings } from '../strings';

export interface AvatarActions {
  pick(): Promise<string | undefined>;
  save(avatar: string | null): Promise<void>;
  saveRecipe?(recipe: AvatarRecipe): Promise<void>;
}

type AvatarDraft = { image: string | null } | { recipe: AvatarRecipe };

export function useAvatarEditor(
  { pick, save, saveRecipe }: AvatarActions,
  saveFailure?: (error: unknown) => string,
): AvatarEditor {
  const t = useStrings();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [failedDraft, setFailedDraft] = useState<AvatarDraft>();
  const change = async (choice: 'photo' | AvatarDraft) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    let draft: AvatarDraft | undefined;
    setFailedDraft(undefined);
    try {
      if (choice === 'photo') {
        let picked: string | undefined;
        try {
          picked = await pick();
        } catch {
          setError(t.avatarPickFailed);
          return false;
        }
        if (picked === undefined) return false;
        draft = { image: picked };
      } else {
        draft = choice;
      }
      if ('recipe' in draft) {
        if (!saveRecipe) return false;
        await saveRecipe(draft.recipe);
      } else {
        await save(draft.image);
      }
      return true;
    } catch (failure) {
      setFailedDraft(draft);
      setError(saveFailure?.(failure) ?? t.avatarSaveFailed + ' ' + errorText(failure));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    choose: (image?: string) => change(image === undefined ? 'photo' : { image }),
    chooseRecipe: saveRecipe && ((recipe) => change({ recipe })),
    remove: () => change({ image: null }),
    retry: failedDraft && (() => change(failedDraft)),
  };
}

type AvatarEditor = {
  busy: boolean;
  error: string | undefined;
  choose(image?: string): Promise<boolean>;
  chooseRecipe?: ((recipe: AvatarRecipe) => Promise<boolean>) | undefined;
  remove(): Promise<boolean>;
  retry?: (() => Promise<boolean>) | undefined;
};

export function EditableAvatar({
  editor,
  children,
  corner,
  testID,
  label,
  onChange,
}: {
  editor: AvatarEditor;
  children: ReactNode;
  corner: number;
  testID: string;
  label?: string;
  onChange?: (() => void) | undefined;
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
      onPress={onChange ?? (() => void editor.choose())}
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
  onChange,
}: {
  editor: AvatarEditor;
  hasAvatar: boolean;
  portrait: ReactNode;
  testID: string;
  on?: LayerName;
  onChange?: (() => void) | undefined;
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
          control={{ kind: 'chevron' }}
          onPress={editor.busy ? undefined : (onChange ?? (() => void editor.choose()))}
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
      {editor.retry ? (
        <Button label={t.retry} disabled={editor.busy} onPress={() => void editor.retry?.()} />
      ) : null}
      {editor.error === undefined ? null : (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {editor.error}
        </Text>
      )}
    </View>
  );
}

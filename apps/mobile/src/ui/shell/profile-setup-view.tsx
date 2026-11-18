import { useRef, useState } from 'react';
import { View } from 'react-native';

import { validAccountName } from '../../account/account-profile';
import type { useAvatarEditor } from '../chat/avatar-editor';
import { EditableAvatar } from '../chat/avatar-editor';
import { profileShell, radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { DrawerHeader } from '../primitives/drawer-header';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

export function ProfileSetupView({
  name,
  avatar,
  hasAvatar,
  editor,
  onDone,
  onLater,
}: {
  name: string;
  avatar: string | undefined;
  hasAvatar: boolean;
  editor: ReturnType<typeof useAvatarEditor>;
  onDone(name: string): Promise<void>;
  onLater(): Promise<void>;
}) {
  const t = useStrings();
  const copy = t.accountProfile;
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const valid = validAccountName(draft);
  const run = async (work: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const done = () => {
    if (valid) void run(() => onDone(draft.trim()));
  };
  return (
    <View style={{ flex: 1 }} testID="profile-setup">
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
        <DrawerHeader
          title={copy.setupTitle}
          trailing={
            <SheetSaveButton
              label={copy.setupDone}
              testID="profile-setup-done"
              busy={busy}
              disabled={!valid || editor.busy}
              onPress={done}
            />
          }
        />
      </View>
      <KeyboardFormScroll
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x4, padding: space.x5 }}
      >
        <Text tone="muted">{copy.setupHint}</Text>
        <View style={{ alignItems: 'center', gap: space.x2, paddingVertical: space.x3 }}>
          <EditableAvatar
            editor={editor}
            corner={radius.round}
            testID="profile-setup-photo"
            label={hasAvatar ? t.avatarChange : t.avatarChoose}
          >
            <AccountAvatar uri={avatar} name={draft || name} size={profileShell.avatar} />
          </EditableAvatar>
          <Button
            label={hasAvatar ? t.avatarChange : t.avatarChoose}
            variant="text"
            busy={editor.busy}
            disabled={busy}
            testID="profile-setup-choose-photo"
            onPress={() => void editor.choose()}
          />
          {editor.error === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {editor.error}
            </Text>
          )}
        </View>
        <TextField
          testID="profile-setup-name"
          editable={!busy}
          label={copy.name}
          accessibilityLabel={copy.name}
          value={draft}
          invalid={draft.length > 0 && !valid}
          supportingText={draft.length > 0 && !valid ? copy.nameInvalid : copy.setupNameHint}
          autoCorrect={false}
          returnKeyType="done"
          onChangeText={setDraft}
          onSubmitEditing={done}
        />
        {failed ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.saveFailed}
          </Text>
        ) : null}
        <Button
          label={copy.setupLater}
          variant="text"
          disabled={busy}
          testID="profile-setup-later"
          onPress={() => void run(onLater)}
        />
      </KeyboardFormScroll>
    </View>
  );
}

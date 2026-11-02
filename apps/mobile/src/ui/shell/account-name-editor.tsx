import { useRef, useState } from 'react';
import { View } from 'react-native';

import { ACCOUNT_NAME_MAX, validAccountName } from '../../account/account-profile';
import { space } from '../design/tokens';
import { DrawerHeader } from '../primitives/drawer-header';
import { labelInField } from '../primitives/field-label';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsHeading } from '../primitives/settings-row';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';

export function AccountNameEditor({
  name,
  onSave,
  onClose,
}: {
  name: string;
  onSave(name: string): Promise<void>;
  onClose(): void;
}) {
  const t = useStrings();
  const copy = t.accountProfile;
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const valid = validAccountName(draft);
  const save = async () => {
    if (saving.current || !valid) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onSave(draft.trim());
      onClose();
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}>
        <DrawerHeader
          title={copy.name}
          onBack={onClose}
          trailing={
            <SheetSaveButton
              label={copy.nameSave}
              testID="account-name-save"
              busy={busy}
              disabled={!valid}
              onPress={() => void save()}
            />
          }
        />
      </View>
      <KeyboardFormScroll
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.x2, padding: space.x5 }}
      >
        {labelInField ? null : <SettingsHeading>{copy.name}</SettingsHeading>}
        <TextField
          testID="account-name-field"
          autoFocus
          editable={!busy}
          label={copy.name}
          accessibilityLabel={copy.name}
          value={draft}
          maxLength={ACCOUNT_NAME_MAX}
          invalid={draft.length > 0 && !valid}
          {...(draft.length > 0 && !valid ? { supportingText: copy.nameInvalid } : {})}
          autoCorrect={false}
          returnKeyType="done"
          onChangeText={setDraft}
          onSubmitEditing={() => void save()}
        />
        {failed ? (
          <Text accessibilityRole="alert" tone="danger">
            {copy.saveFailed}
          </Text>
        ) : null}
      </KeyboardFormScroll>
    </View>
  );
}

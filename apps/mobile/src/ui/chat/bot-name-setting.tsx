import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { errorText } from '../../host/bot-settings';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import type { LayerName } from '../design/layers';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { Sheet, SheetActions } from './sheet';

function RenameBotSheet({
  name,
  onSave,
  onClose,
}: {
  name: string;
  onSave(name: string): Promise<void>;
  onClose(): void;
}) {
  const t = useStrings();
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const next = draft.trim();
  const save = async () => {
    if (pending.current || next === '' || next === name) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onSave(next);
      onClose();
    } catch (failure) {
      setError(`${t.botRenameFailed} ${errorText(failure)}`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible
      label={t.botRename}
      title={t.botRename}
      onClose={() => {
        if (!pending.current) onClose();
      }}
      avoidKeyboard
    >
      <KeyboardFormScroll enabled={false}>
        <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
          <TextField
            testID="bot-name-input"
            accessibilityLabel={t.botName}
            value={draft}
            onChangeText={setDraft}
            editable={!busy}
            invalid={error !== undefined}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
          {error === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {error}
            </Text>
          )}
        </View>
        <SheetActions>
          <View>
            <Button label={t.cancel} disabled={busy} on="canvas" onPress={onClose} />
          </View>
          <View>
            <Button
              testID="bot-name-save"
              label={t.botNameSave}
              busy={busy}
              disabled={next === '' || next === name}
              tone="primary"
              on="canvas"
              onPress={() => void save()}
            />
          </View>
        </SheetActions>
      </KeyboardFormScroll>
    </Sheet>
  );
}

export function BotNameSetting({
  name,
  onSave,
  on = 'sheet',
  leading,
}: {
  name: string;
  onSave(name: string): Promise<void>;
  on?: LayerName;
  leading?: ReactNode;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <SettingsRow
        on={on}
        testID="bot-name-change"
        title={t.botName}
        detail={name}
        leading={leading}
        accessibilityLabel={`${t.botRename}, ${name}`}
        trailing={<ChevronRightIcon color={theme.color.muted} size={theme.type.body.line} />}
        onPress={() => setEditing(true)}
      />
      {editing ? (
        <RenameBotSheet name={name} onSave={onSave} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

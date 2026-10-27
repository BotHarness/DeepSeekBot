import { messageDisplayPreferences, useMessageDisplay } from '../../host/native-message-display';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function MessageDisplaySettings() {
  const t = useStrings();
  const state = useMessageDisplay();
  return (
    <SettingsSection
      title={t.messageDisplay.title}
      on={SHEET_GROUP}
      footer={state.storageError ? t.messageDisplay.storageError : t.messageDisplay.hint}
    >
      {(['streaming', 'complete'] as const).map((mode) => (
        <SettingsRow
          key={mode}
          on={SHEET_GROUP}
          title={t.messageDisplay[mode]}
          detail={t.messageDisplay[`${mode}Hint`]}
          selected={state.loaded && state.mode === mode}
          control={state.loaded && state.mode === mode ? { kind: 'check' } : undefined}
          onPress={state.loaded ? () => messageDisplayPreferences.setMode(mode) : undefined}
        />
      ))}
    </SettingsSection>
  );
}

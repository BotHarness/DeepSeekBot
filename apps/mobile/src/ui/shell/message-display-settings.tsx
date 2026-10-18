import { messageDisplayPreferences, useMessageDisplay } from '../../host/native-message-display';
import { SHEET_GROUP } from '../chat/sheet';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { t } from '../strings';
import { CheckIcon } from './icons';

export function MessageDisplaySettings() {
  const state = useMessageDisplay();
  const theme = useDesignTheme();
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
          trailing={
            state.loaded && state.mode === mode ? (
              <CheckIcon size={space.x5} color={theme.color.accent} />
            ) : undefined
          }
          onPress={state.loaded ? () => messageDisplayPreferences.setMode(mode) : undefined}
        />
      ))}
    </SettingsSection>
  );
}

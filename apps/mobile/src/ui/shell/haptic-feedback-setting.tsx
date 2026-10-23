import { hapticPreferences, useHapticPreferences } from '../../host/native-haptic-feedback';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { Toggle } from '../primitives/toggle';
import { useStrings } from '../strings';

export function HapticFeedbackSetting() {
  const t = useStrings();
  const state = useHapticPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.hapticFeedback.title}
      {...(state.storageError ? { detail: t.hapticFeedback.storageError } : {})}
      trailing={
        <Toggle
          testID="haptic-feedback-toggle"
          on={SHEET_GROUP}
          label={t.hapticFeedback.title}
          value={state.enabled}
          disabled={!state.loaded}
          onChange={(enabled) => hapticPreferences.setEnabled(enabled)}
        />
      }
    />
  );
}

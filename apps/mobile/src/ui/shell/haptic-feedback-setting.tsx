import { hapticPreferences, useHapticPreferences } from '../../host/native-haptic-feedback';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function HapticFeedbackSetting() {
  const t = useStrings();
  const state = useHapticPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.hapticFeedback.title}
      {...(state.storageError ? { detail: t.hapticFeedback.storageError } : {})}
      control={{
        kind: 'switch',
        value: state.enabled,
        onChange: (enabled) => hapticPreferences.setEnabled(enabled),
        disabled: !state.loaded,
        testID: 'haptic-feedback-toggle',
      }}
    />
  );
}

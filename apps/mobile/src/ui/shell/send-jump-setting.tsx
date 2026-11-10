import { sendJumpPreferences, useSendJumpPreferences } from '../../host/native-send-jump';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function SendJumpSetting() {
  const t = useStrings();
  const state = useSendJumpPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.sendJump.title}
      icon="sendJump"
      detail={state.storageError ? t.sendJump.storageError : t.sendJump.detail}
      control={{
        kind: 'switch',
        value: state.enabled,
        onChange: (enabled) => sendJumpPreferences.setEnabled(enabled),
        disabled: !state.loaded,
        testID: 'send-jump-toggle',
      }}
    />
  );
}

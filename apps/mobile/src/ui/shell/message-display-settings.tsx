import { messageDisplayPreferences, useMessageDisplay } from '../../host/native-message-display';
import { SHEET_GROUP } from '../chat/sheet';
import { PreferenceRow } from '../primitives/preference-row';
import { SettingsFormItem } from '../primitives/settings-form';
import { Notice } from '../request-parts';
import { useStrings } from '../strings';

export function MessageDisplaySetting() {
  const t = useStrings();
  const state = useMessageDisplay();
  return (
    <>
      <PreferenceRow
        on={SHEET_GROUP}
        title={t.messageDisplay.title}
        icon="messageDisplay"
        testID="settings-message-display"
        value={state.mode}
        options={[
          { value: 'streaming', label: t.messageDisplay.streaming, icon: 'streaming' },
          { value: 'complete', label: t.messageDisplay.complete, icon: 'complete' },
        ]}
        onChange={(mode) => messageDisplayPreferences.setMode(mode)}
      />
      {state.storageError ? (
        <SettingsFormItem>
          <Notice tone="danger">{t.messageDisplay.storageError}</Notice>
        </SettingsFormItem>
      ) : null}
    </>
  );
}

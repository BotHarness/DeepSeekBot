import { headerModelPreferences, useHeaderModelPreferences } from '../../host/native-header-model';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function HeaderModelSetting() {
  const t = useStrings();
  const state = useHeaderModelPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.headerModel.title}
      icon="model"
      detail={state.storageError ? t.headerModel.storageError : t.headerModel.detail}
      control={{
        kind: 'switch',
        value: state.enabled,
        onChange: (enabled) => headerModelPreferences.setEnabled(enabled),
        disabled: !state.loaded,
        testID: 'header-model-toggle',
      }}
    />
  );
}

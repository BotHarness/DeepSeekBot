import {
  deliveryReceiptPreferences,
  useDeliveryReceiptPreferences,
} from '../../host/native-delivery-receipts';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function DeliveryReceiptSetting() {
  const t = useStrings();
  const state = useDeliveryReceiptPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.delivery.setting}
      detail={state.storageError ? t.delivery.settingStorageError : t.delivery.settingHint}
      control={{
        kind: 'switch',
        value: state.enabled,
        onChange: (enabled) => deliveryReceiptPreferences.setEnabled(enabled),
        disabled: !state.loaded,
        testID: 'delivery-receipt-toggle',
      }}
    />
  );
}

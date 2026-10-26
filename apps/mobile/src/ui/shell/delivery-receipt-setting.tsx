import {
  deliveryReceiptPreferences,
  useDeliveryReceiptPreferences,
} from '../../host/native-delivery-receipts';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { Toggle } from '../primitives/toggle';
import { useStrings } from '../strings';

export function DeliveryReceiptSetting() {
  const t = useStrings();
  const state = useDeliveryReceiptPreferences();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.delivery.setting}
      detail={state.storageError ? t.delivery.settingStorageError : t.delivery.settingHint}
      trailing={
        <Toggle
          testID="delivery-receipt-toggle"
          on={SHEET_GROUP}
          label={t.delivery.setting}
          value={state.enabled}
          disabled={!state.loaded}
          onChange={(enabled) => deliveryReceiptPreferences.setEnabled(enabled)}
        />
      }
    />
  );
}

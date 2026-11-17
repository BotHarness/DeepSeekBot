import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { DeliveryReceiptSetting } from '../../src/ui/shell/delivery-receipt-setting';
import { MessageDisplaySetting } from '../../src/ui/shell/message-display-settings';
import { SendJumpSetting } from '../../src/ui/shell/send-jump-setting';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function MessagingScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-messaging">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.messagingHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.messaging} on={SHEET_GROUP}>
        <MessageDisplaySetting />
        <SendJumpSetting />
        <DeliveryReceiptSetting />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.chatBackground.global}
          icon="background"
          disclosure
          testID="settings-messaging-chat-background"
          onPress={() => router.push('/settings/chat-background')}
        />
      </SettingsSection>
    </SettingsForm>
  );
}

import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function AdvancedScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-advanced">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.advancedHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.advanced} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.hostSettings.title}
          detail={t.hostSettings.hint}
          icon="computer"
          disclosure
          testID="settings-advanced-host"
          onPress={() => router.push('/settings/host-settings')}
        />
      </SettingsSection>
    </SettingsForm>
  );
}

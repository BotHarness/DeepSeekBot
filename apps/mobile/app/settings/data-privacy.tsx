import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { StatisticsSettings } from '../../src/ui/shell/statistics-settings';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function DataPrivacyScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-data-privacy">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.privacyHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.dataPrivacy} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.storage.title}
          detail={t.storage.hint}
          icon="storage"
          disclosure
          testID="settings-privacy-storage"
          onPress={() => router.push('/settings/storage')}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.usage}
          icon="history"
          disclosure
          testID="settings-privacy-usage"
          onPress={() => router.push('/settings/usage')}
        />
        <StatisticsSettings />
      </SettingsSection>
    </SettingsForm>
  );
}

import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { RouteSelector } from '../../src/ui/shell/route-selector';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function ConnectionsScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-connections">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.connectionsHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.connections} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.settingsHome.connectionsCloud}
          icon="lan"
          disclosure
          testID="settings-connections-cloud"
          onPress={() => router.push('/settings/cloud-connections')}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.settingsHome.connectionsHosts}
          icon="computer"
          disclosure
          testID="settings-connections-hosts"
          onPress={() => router.push('/host-connection')}
        />
      </SettingsSection>
      <RouteSelector />
    </SettingsForm>
  );
}

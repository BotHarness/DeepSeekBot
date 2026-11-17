import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function ModelRuntimeScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-model-runtime">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.modelSettings.title}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.models} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelSettings.title}
          detail={t.modelSettings.global}
          icon="model"
          disclosure
          testID="settings-runtime-models"
          onPress={() => router.push('/settings/models')}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.credentials.title}
          detail={t.credentials.hint}
          icon="access"
          disclosure
          testID="settings-runtime-credentials"
          onPress={() => router.push('/settings/credentials')}
        />
      </SettingsSection>
    </SettingsForm>
  );
}

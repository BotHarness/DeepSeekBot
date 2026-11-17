import { useRouter } from 'expo-router';

import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { HapticFeedbackSetting } from '../../src/ui/shell/haptic-feedback-setting';
import { AppearanceSetting, InterfaceSaveNotice, LanguageSetting } from '../../src/ui/interface-settings';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function GeneralScreen() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsForm testID="settings-general">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.generalHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.general} on={SHEET_GROUP}>
        <LanguageSetting on={SHEET_GROUP} />
        <AppearanceSetting on={SHEET_GROUP} />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appIcon}
          icon="appIcon"
          disclosure
          testID="settings-general-app-icon"
          onPress={() => router.push('/settings/app-icon')}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.activityCountSettings.title}
          icon="activityCount"
          disclosure
          testID="settings-general-activity-count"
          onPress={() => router.push('/settings/activity-count')}
        />
        <HapticFeedbackSetting />
      </SettingsSection>
      <InterfaceSaveNotice />
    </SettingsForm>
  );
}

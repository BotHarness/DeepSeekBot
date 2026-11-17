import { useState } from 'react';

import { appBuildLabel } from '../../src/ui/app-build';
import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { copyMessage } from '../../src/ui/chat/message-menu';
import { currentAppBuild } from '../../src/ui/native-app-build';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function AboutScreen() {
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  const version = appBuildLabel(currentAppBuild());
  return (
    <SettingsForm testID="settings-about">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.aboutHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.about} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appVersion}
          icon="version"
          detail={version === '' ? t.appVersionUnknown : copied ? `${version} · ${t.copied}` : version}
          onPress={
            version === ''
              ? undefined
              : () => {
                  copyMessage(version);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
          }
        />
      </SettingsSection>
    </SettingsForm>
  );
}

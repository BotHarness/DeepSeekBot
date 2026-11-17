import { useRouter } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { SettingsForm, SettingsFormItem } from '../../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { useStrings } from '../../src/ui/strings';

export default function AutoApprovalScreen() {
  const t = useStrings();
  const router = useRouter();
  const { client } = useHostSession();
  const bots = useHostSnapshot(client).roster?.bots ?? [];
  return (
    <SettingsForm testID="settings-auto-approval">
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.approvalHint}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={t.settingsHome.autoApproval} on={SHEET_GROUP}>
        {bots.map((bot) => (
          <SettingsRow
            key={bot.slug}
            on={SHEET_GROUP}
            title={bot.displayName}
            icon="rules"
            disclosure
            testID={`settings-approval-${bot.slug}`}
            onPress={() => router.push(`/bot/${bot.slug}/approval-rules`)}
          />
        ))}
      </SettingsSection>
      {bots.length === 0 ? (
        <SettingsFormItem>
          <Text tone="muted">{t.settingsHome.capabilityEmpty}</Text>
        </SettingsFormItem>
      ) : null}
    </SettingsForm>
  );
}

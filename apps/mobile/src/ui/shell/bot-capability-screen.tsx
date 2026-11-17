import { useState } from 'react';
import { View } from 'react-native';

import { botAccess, setBotAccess, type BotAccessKind } from '../../host/bot-access';
import type { HostClient, RosterBot } from '@botharness/host-client/client';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { space } from '../design/tokens';
import { confirmDestructive } from '../primitives/app-dialog';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { SHEET_GROUP } from '../chat/sheet';

function CapabilityRow({
  client,
  bot,
  kind,
  label,
}: {
  client: HostClient;
  bot: RosterBot;
  kind: BotAccessKind;
  label: string;
}) {
  const copy = useStrings().settingsHome;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const value = botAccess(bot)[kind];
  const commit = async (next: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await setBotAccess(client, bot.slug, kind, next);
    } catch {
      setError(copy.capabilityFailed);
    } finally {
      setBusy(false);
    }
  };
  const request = (next: boolean) => {
    if (busy || next === value) return;
    const title = next
      ? copy.capabilityConfirm(label)
      : copy.capabilityDisableConfirm(label);
    const message = next
      ? copy.capabilityHint(label, bot.displayName)
      : copy.capabilityDisableHint(label, bot.displayName);
    const action = next ? copy.capabilityEnable : copy.capabilityDisable;
    confirmDestructive(title, message, action, () => void commit(next));
  };
  return (
    <View>
      <SettingsRow
        on={SHEET_GROUP}
        title={bot.displayName}
        icon={kind}
        tone="fg"
        control={{
          kind: 'switch',
          value,
          onChange: request,
          disabled: busy,
          testID: `capability-${kind}-${bot.slug}`,
        }}
      />
      {error === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger" style={{ paddingHorizontal: space.x5 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function BotCapabilityScreen({ kind }: { kind: BotAccessKind }) {
  const t = useStrings();
  const { client } = useHostSession();
  const bots = useHostSnapshot(client).roster?.bots ?? [];
  const label = kind === 'computer' ? t.profilePermissions.computer : t.profilePermissions.browser;
  const title = kind === 'computer' ? t.settingsHome.computerControl : t.settingsHome.browserControl;
  if (client === undefined)
    return (
      <SettingsForm testID={`capability-${kind}`}>
        <SettingsFormItem>
          <Text tone="muted">{t.unreachable}</Text>
        </SettingsFormItem>
      </SettingsForm>
    );
  return (
    <SettingsForm testID={`capability-${kind}`}>
      <SettingsFormItem>
        <Text variant="meta" tone="muted">
          {t.settingsHome.capabilityIntro}
        </Text>
      </SettingsFormItem>
      <SettingsSection title={title} on={SHEET_GROUP}>
        {bots.map((bot) => (
          <CapabilityRow key={bot.slug} client={client} bot={bot} kind={kind} label={label} />
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

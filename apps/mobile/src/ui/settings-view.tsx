import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { ConnectionState } from '../host/client';
import type { OverviewUsage } from '../host/usage';
import { SHEET_GROUP } from './chat/sheet';
import { useDesignTheme } from './design/theme';
import { space } from './design/tokens';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { errorText, Notice } from './request-parts';
import { UsageCard } from './shell/usage-card';
import { t } from './strings';

export interface SettingsActions {
  onClose(): void;
  onUsage(): void;
  onOpenFullClient(): void;
  onComputers(): void;
  onAppIcon(): void;
  onNotifications(): void;
  onUnpair(): Promise<void>;
  onCopyVersion(text: string): void;
}

const STATUS: Record<ConnectionState['status'], string> = {
  connected: t.connected,
  connecting: t.connecting,
  reconnecting: t.reconnecting,
  refused: t.refused,
  unreachable: t.unreachable,
  stopped: '',
};

export function SettingsView({
  hostName,
  connection,
  loadUsage,
  version,
  actions,
  statistics,
}: {
  hostName: string | undefined;
  connection: ConnectionState;
  loadUsage?: (() => Promise<OverviewUsage>) | undefined;
  version: string;
  actions: SettingsActions;
  statistics?: ReactNode;
}) {
  const theme = useDesignTheme();
  const [unpairError, setUnpairError] = useState<string>();
  const [versionCopied, setVersionCopied] = useState(false);
  const status = [STATUS[connection.status], connection.route].filter((part) => part !== '');
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginRight: -space.x3,
        }}
      >
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t.settings}
        </Text>
        <Pressable
          onPress={actions.onClose}
          accessibilityRole="button"
          accessibilityLabel={t.done}
          style={({ pressed }) => ({
            minWidth: theme.touch,
            minHeight: theme.touch,
            paddingHorizontal: space.x3,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text tone="accent" strong>
            {t.done}
          </Text>
        </Pressable>
      </View>
      <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
      <SettingsSection title={t.connections} on={SHEET_GROUP}>
        <SettingsRow on={SHEET_GROUP} title={hostName ?? '—'} detail={status.join(' · ')} />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.computers}
          detail={t.computersHint}
          onPress={actions.onComputers}
        />
        <SettingsRow on={SHEET_GROUP} title={t.notifications} onPress={actions.onNotifications} />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.openFullClient}
          tone="accent"
          onPress={actions.onOpenFullClient}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.unpair}
          tone="danger"
          onPress={() => {
            setUnpairError(undefined);
            actions.onUnpair().catch((error: unknown) => setUnpairError(errorText(error)));
          }}
        />
      </SettingsSection>
      {unpairError === undefined ? null : (
        <Notice tone="danger">{`${t.unpairFailed} ${unpairError}`}</Notice>
      )}
      <SettingsSection title={t.interface} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appIcon}
          detail={t.appIconHint}
          onPress={actions.onAppIcon}
        />
      </SettingsSection>
      <SettingsSection title={t.about} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appVersion}
          detail={
            version === ''
              ? t.appVersionUnknown
              : versionCopied
                ? `${version} · ${t.copied}`
                : version
          }
          accessibilityLabel={`${t.appVersion}, ${version === '' ? t.appVersionUnknown : version}, ${t.copy}`}
          onPress={
            version === ''
              ? undefined
              : () => {
                  actions.onCopyVersion(version);
                  setVersionCopied(true);
                  setTimeout(() => setVersionCopied(false), 1500);
                }
          }
        />
      </SettingsSection>
      {statistics}
    </ScrollView>
  );
}

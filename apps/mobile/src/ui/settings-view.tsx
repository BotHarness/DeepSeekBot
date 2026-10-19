import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { ConnectionState } from '../host/client';
import type { OverviewUsage } from '../host/usage';
import { SHEET_GROUP } from './chat/sheet';
import { useDesignTheme } from './design/theme';
import { space } from './design/tokens';
import { DrawerHeader } from './primitives/drawer-header';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { errorText, Notice } from './request-parts';
import { UsageCard } from './shell/usage-card';
import { t } from './strings';

export interface SettingsActions {
  onUsage(): void;
  onOpenFullClient(): void;
  onComputers(): void;
  onAppIcon(): void;
  onNotifications(): void;
  onModels(): void;
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
  messageDisplay,
  activityCount,
  chatBackground,
}: {
  hostName: string | undefined;
  connection: ConnectionState;
  loadUsage?: (() => Promise<OverviewUsage>) | undefined;
  version: string;
  actions: SettingsActions;
  statistics?: ReactNode;
  messageDisplay?: ReactNode;
  activityCount?: ReactNode;
  chatBackground?: ReactNode;
}) {
  const theme = useDesignTheme();
  const [unpairError, setUnpairError] = useState<string>();
  const [versionCopied, setVersionCopied] = useState(false);
  const status = [STATUS[connection.status], connection.route].filter((part) => part !== '');
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5 }}>
        <DrawerHeader title={t.settings} />
      </View>
      <ScrollView
        nestedScrollEnabled
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
      >
        <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
        <SettingsSection title={t.modelSettings.title} on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            title={t.modelSettings.title}
            detail={t.modelSettings.global}
            disclosure
            onPress={actions.onModels}
          />
        </SettingsSection>
        <SettingsSection title={t.connections} on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={hostName ?? '—'} detail={status.join(' · ')} />
          <SettingsRow
            on={SHEET_GROUP}
            title={t.computers}
            detail={t.computersHint}
            disclosure
            onPress={actions.onComputers}
          />
          <SettingsRow
            on={SHEET_GROUP}
            title={t.notifications}
            disclosure
            onPress={actions.onNotifications}
          />
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
            disclosure
            onPress={actions.onAppIcon}
          />
          {activityCount}
          {chatBackground}
        </SettingsSection>
        {messageDisplay}
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
    </View>
  );
}

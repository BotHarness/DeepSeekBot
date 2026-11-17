import { useState, type ReactNode } from 'react';

import type { OverviewUsage } from '@botharness/host-client/usage';
import { SHEET_GROUP } from './chat/sheet';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { UsageCard } from './shell/usage-card';
import { AppearanceSetting, InterfaceSaveNotice, LanguageSetting } from './interface-settings';
import { useStrings } from './strings';

export interface SettingsActions {
  onUsage(): void;
  onAppIcon(): void;
  onNotifications(): void;
  onStorage(): void;
  onHostSettings?(): void;
  onCredentials?(): void;
  onCloudConnections?(): void;
  onAppSetup?(): void;
  onModels(): void;
  onCopyVersion(text: string): void;
}

export function SettingsView({
  profile,
  loadUsage,
  version,
  actions,
  statistics,
  messageDisplay,
  sendJump,
  activityCount,
  theme,
  chatBackground,
  routeSelector,
  hapticFeedback,
  deliveryReceipts,
}: {
  profile?: ReactNode;
  loadUsage?: (() => Promise<OverviewUsage>) | undefined;
  version: string;
  actions: SettingsActions;
  statistics?: ReactNode;
  messageDisplay?: ReactNode;
  sendJump?: ReactNode;
  activityCount?: ReactNode;
  theme?: ReactNode;
  chatBackground?: ReactNode;
  routeSelector?: ReactNode;
  hapticFeedback?: ReactNode;
  deliveryReceipts?: ReactNode;
}) {
  const t = useStrings();
  const [versionCopied, setVersionCopied] = useState(false);
  return (
    <SettingsForm>
      {profile}
      {routeSelector}
      <SettingsFormItem>
        <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
      </SettingsFormItem>
      <SettingsSection title={t.modelSettings.title} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelSettings.title}
          icon="model"
          detail={t.modelSettings.global}
          disclosure
          onPress={actions.onModels}
        />
      </SettingsSection>
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.notifications}
          icon="notifications"
          disclosure
          onPress={actions.onNotifications}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.storage.title}
          icon="storage"
          detail={t.storage.hint}
          disclosure
          onPress={actions.onStorage}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.hostSettings.title}
          icon="computer"
          detail={t.hostSettings.hint}
          disclosure
          testID="settings-host-settings"
          onPress={actions.onHostSettings}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.credentials.title}
          icon="access"
          detail={t.credentials.hint}
          disclosure
          testID="settings-credentials"
          onPress={actions.onCredentials}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.cloudConnections.title}
          icon="lan"
          detail={t.cloudConnections.hint}
          disclosure
          testID="settings-cloud-connections"
          onPress={actions.onCloudConnections}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appSetup.title}
          icon="account"
          detail={t.appSetup.hint}
          disclosure
          testID="settings-app-setup"
          onPress={actions.onAppSetup}
        />
      </SettingsSection>
      <SettingsSection title={t.interface} on={SHEET_GROUP} footer={t.interfacePreferences.local}>
        <LanguageSetting on={SHEET_GROUP} />
        <AppearanceSetting on={SHEET_GROUP} />
        {messageDisplay}
        {sendJump}
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appIcon}
          icon="appIcon"
          disclosure
          onPress={actions.onAppIcon}
        />
        {activityCount}
        {theme}
        {chatBackground}
        {hapticFeedback}
        {deliveryReceipts}
      </SettingsSection>
      <InterfaceSaveNotice />
      <SettingsSection title={t.about} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.appVersion}
          icon="version"
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
    </SettingsForm>
  );
}

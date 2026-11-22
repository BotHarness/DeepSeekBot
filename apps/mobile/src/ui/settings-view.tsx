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
  onModelProviders(): void;
  onModels(): void;
  onPrompts(): void;
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
  chatBackground,
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
  chatBackground?: ReactNode;
  hapticFeedback?: ReactNode;
  deliveryReceipts?: ReactNode;
}) {
  const t = useStrings();
  const [versionCopied, setVersionCopied] = useState(false);
  return (
    <SettingsForm>
      {profile}
      <SettingsFormItem>
        <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
      </SettingsFormItem>
      <SettingsSection title={t.modelConfig.section} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelProviders.title}
          icon="encrypted"
          detail={t.modelProviders.hint}
          disclosure
          testID="settings-model-providers"
          onPress={actions.onModelProviders}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelConfig.title}
          icon="model"
          detail={t.modelConfig.rowHint}
          disclosure
          onPress={actions.onModels}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={t.prompts.title}
          icon="prompts"
          detail={t.prompts.hint}
          disclosure
          testID="settings-prompts"
          onPress={actions.onPrompts}
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

import { useState, type ReactNode } from 'react';

import type { OverviewUsage } from '@botharness/host-client/usage';
import { SHEET_GROUP } from './chat/sheet';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { UsageCard } from './shell/usage-card';
import {
  AppearanceSetting,
  HideBarsSetting,
  InterfaceSaveNotice,
  LanguageSetting,
  SessionNavigationSettings,
  SessionsTabSetting,
} from './interface-settings';
import { useStrings } from './strings';

export interface SettingsActions {
  onUsage(): void;
  onAppIcon(): void;
  onNotifications(): void;
  onStorage(): void;
  onModelProviders(): void;
  onModels(): void;
  onVoice?: (() => void) | undefined;
  onImApps?: (() => void) | undefined;
  onPrompts(): void;
  onCopyVersion(text: string): void;
}

export function SettingsView({
  environment,
  environmentFooter,
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
  tabBar,
  sessionRequests,
}: {
  environment?: ReactNode;
  environmentFooter?: string | undefined;
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
  tabBar?: ReactNode;
  sessionRequests?: ReactNode;
}) {
  const t = useStrings();
  const [versionCopied, setVersionCopied] = useState(false);
  return (
    <SettingsForm>
      {profile}
      {environment === undefined ? null : (
        <SettingsSection title={t.environmentSheet.settings} on={SHEET_GROUP}>
          {environment}
        </SettingsSection>
      )}
      <SettingsFormItem>
        <UsageCard load={loadUsage} on={SHEET_GROUP} onOpen={actions.onUsage} />
      </SettingsFormItem>
      <SettingsSection on={SHEET_GROUP} footer={environmentFooter}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelProviders.title}
          icon="encrypted"
          detail={t.modelProviders.hint}
          disclosure
          testID="settings-model-providers"
          onPress={actions.onModelProviders}
        />
        {actions.onVoice === undefined ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={t.voiceSettings.title}
            icon="voice"
            detail={t.voiceSettings.rowHint}
            disclosure
            testID="settings-voice"
            onPress={actions.onVoice}
          />
        )}
        <SettingsRow
          on={SHEET_GROUP}
          title={t.modelConfig.title}
          icon="model"
          detail={t.modelConfig.rowHint}
          disclosure
          onPress={actions.onModels}
        />
        {actions.onImApps === undefined ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={t.imApps.title}
            icon="messageDisplay"
            detail={t.imApps.rowHint}
            disclosure
            testID="settings-im-apps"
            onPress={actions.onImApps}
          />
        )}
        <SettingsRow
          on={SHEET_GROUP}
          title={t.prompts.title}
          icon="prompts"
          detail={t.prompts.hint}
          disclosure
          testID="settings-prompts"
          onPress={actions.onPrompts}
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
      <SettingsSection
        title={t.environmentSheet.phone}
        on={SHEET_GROUP}
        footer={t.interfacePreferences.local}
      >
        <SettingsRow
          on={SHEET_GROUP}
          title={t.notifications}
          icon="notifications"
          disclosure
          onPress={actions.onNotifications}
        />
        <LanguageSetting on={SHEET_GROUP} />
        <AppearanceSetting on={SHEET_GROUP} />
        <SessionsTabSetting on={SHEET_GROUP} />
        {tabBar}
        <HideBarsSetting on={SHEET_GROUP} />
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
      <SessionNavigationSettings on={SHEET_GROUP} />
      {sessionRequests}
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

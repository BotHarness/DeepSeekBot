import type { ReactElement, ReactNode } from 'react';

import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeActions } from './actions.js';
import { ApprovalReviewerModelSetting } from './approval-reviewer-model-setting.js';
import {
  AssignmentConcurrencyRow,
  BotIconSetting,
  ApprovalReviewSessionsVisibilitySetting,
  BotSessionsVisibilitySetting,
  DeveloperModeSetting,
  GroupAutoAcceptSetting,
  MotionSetting,
  SendKeySetting,
  SortSetting,
} from './bot-mode-setting-rows.js';
import { ApprovalTemplateLibrarySettings } from './approval-template-library.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import type { BridgeCall } from './bridge.js';
import type { DesktopNotificationPrefs } from './desktop-notifications.js';
import { SettingsRows, SettingsSection } from './ds/settings-row.js';
import { GitSettings } from './git-settings.js';
import { HumanNameSettings } from './human-name-settings.js';
import { MessagingDefaultsSettings } from './messaging-defaults-settings.js';
import { DesktopNotificationSetting, ShortcutHelpSetting } from './notification-settings.js';
import { DefaultModelSettings, OnboardingSetting } from './onboarding-view.js';
import { PairedDevicesSettings } from './paired-devices.js';
import { ProfileBackupSettings } from './profile-backup.js';
import type { ReleaseNotesController } from './release-notes.js';
import type { ShortcutHelp } from './shortcut-help.js';
import { ReleaseSettings } from './release-notes-view.js';
import type { ClientStore } from './store.js';
import { TelemetrySettings } from './telemetry-settings.js';
import type { WindowCompanions } from './window-companions.js';
import { CompanionSettings } from './window-companions-view.js';

type SectionProps<Face extends object> = PropsLocale<'botharness'> & InjectFace<Face>;

function Rows({ children }: { children: ReactNode }): ReactElement {
  return <SettingsRows>{children}</SettingsRows>;
}

export type GeneralSectionFace = BotModePrefsFace & {
  call: BridgeCall;
  store: ClientStore;
  onSaved(): Promise<void>;
  actions: BridgeActions;
  closeBotSettings(): void;
  desktopNotifications: DesktopNotificationPrefs;
  shortcutHelp: ShortcutHelp;
};

export function GeneralSection(props: SectionProps<GeneralSectionFace>): ReactElement {
  return (
    <Rows>
      <HumanNameSettings
        call={props.call}
        store={props.store}
        onSaved={props.onSaved}
        t={props.t}
      />
      <BotIconSetting {...props} />
      <MotionSetting {...props} />
      <SortSetting {...props} />
      <SendKeySetting {...props} />
      <BotSessionsVisibilitySetting {...props} />
      <ApprovalReviewSessionsVisibilitySetting {...props} />
      <DesktopNotificationSetting desktopNotifications={props.desktopNotifications} t={props.t} />
      <ShortcutHelpSetting shortcutHelp={props.shortcutHelp} t={props.t} />
      <OnboardingSetting
        actions={props.actions}
        closeBotSettings={props.closeBotSettings}
        t={props.t}
      />
    </Rows>
  );
}

export function ModelsSection(
  props: SectionProps<BotModePrefsFace & { actions: BridgeActions }>,
): ReactElement {
  return (
    <Rows>
      <DefaultModelSettings actions={props.actions} t={props.t} />
      <AssignmentConcurrencyRow {...props} />
    </Rows>
  );
}

export function AutoApprovalSection(
  props: SectionProps<{ actions: BridgeActions; call: BridgeCall; store: ClientStore }>,
): ReactElement {
  return (
    <Rows>
      <SettingsSection>
        <ApprovalReviewerModelSetting actions={props.actions} t={props.t} />
      </SettingsSection>
      <ApprovalTemplateLibrarySettings call={props.call} store={props.store} t={props.t} />
    </Rows>
  );
}

export function MessagingSection(
  props: SectionProps<BotModePrefsFace & { call: BridgeCall }>,
): ReactElement {
  return (
    <Rows>
      <SettingsSection>
        <GroupAutoAcceptSetting {...props} />
      </SettingsSection>
      <MessagingDefaultsSettings call={props.call} t={props.t} />
    </Rows>
  );
}

export function CompanionsSection({
  companion,
  t,
}: SectionProps<{ companion: WindowCompanions }>): ReactElement {
  return (
    <Rows>
      <CompanionSettings companion={companion} t={t} />
    </Rows>
  );
}

export function DevicesSection({ t }: PropsLocale<'botharness'>): ReactElement {
  return (
    <Rows>
      <PairedDevicesSettings t={t} />
    </Rows>
  );
}

export function DataPrivacySection({ call, t }: SectionProps<{ call: BridgeCall }>): ReactElement {
  return (
    <Rows>
      <ProfileBackupSettings t={t} />
      <TelemetrySettings call={call} t={t} />
    </Rows>
  );
}

export function AdvancedSection(
  props: SectionProps<BotModePrefsFace & { call: BridgeCall }>,
): ReactElement {
  return (
    <Rows>
      <DeveloperModeSetting {...props} />
      <GitSettings call={props.call} t={props.t} />
    </Rows>
  );
}

export function AboutSection({
  releaseNotes,
  t,
}: SectionProps<{ releaseNotes: ReleaseNotesController }>): ReactElement {
  return (
    <Rows>
      <ReleaseSettings releaseNotes={releaseNotes} t={t} />
    </Rows>
  );
}

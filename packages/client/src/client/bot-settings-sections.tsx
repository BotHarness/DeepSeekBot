import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { BOT_SETTINGS_SECTIONS } from './bot-settings.js';
import { LOCALE_NS } from './locale.js';
import { ModelProvidersSettings } from './model-providers-settings.js';
import { WindowZoomSettings } from './window-zoom-settings.js';
import { WindowZoomSetup } from './window-zoom-setup.js';
import type { ZoomSurface } from './window-zoom-mount.js';
import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import { Select } from './ds/select.js';

import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeActions } from './actions.js';
import { AccountProfileSettings } from './account-profile-settings.js';
import { MyUploadsSettingsRow } from './market-mine.js';
import type { ConnectSignInCode } from './connect-sign-in.js';
import { ApprovalReviewerModelSetting } from './approval-reviewer-model-setting.js';
import { VoiceProviderSettings } from './voice-settings.js';
import {
  AssignmentConcurrencyRow,
  BotHopLimitRow,
  ApprovalReviewSessionsVisibilitySetting,
  BotSessionsVisibilitySetting,
  DeveloperModeSetting,
  GroupAutoAcceptSetting,
  MotionSetting,
  SendKeySetting,
  AutoCollapseMessagesSetting,
  DeliveryReceiptsSetting,
  DmAvatarSetting,
  OwnAvatarSetting,
  StreamRepliesSetting,
  SessionCollapseSetting,
  SessionDetailLevelSetting,
  SessionFoldedRepliesSetting,
} from './bot-mode-setting-rows.js';
import { ApprovalTemplateLibrarySettings } from './approval-template-library.js';
import { PromptPresetSettings } from './prompt-preset-settings.js';
import { BotModeDefaultSetting, BotModeTemplateSettings } from './bot-mode-settings.js';
import { buildLabel, clientBuild } from './build-id.js';
import { DataResetSettings } from './data-reset-settings.js';
import { StorageSettings } from './storage-settings.js';
import { botModePrefsFace, type BotModePrefs, type BotModePrefsFace } from './bot-mode-prefs.js';
import type { BridgeCall } from './bridge.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { GitSettings } from './git-settings.js';
import { HumanNameSettings } from './human-name-settings.js';
import { HumanAvatarSettings } from './human-avatar-settings.js';
import { CompactionThresholdSetting } from './compaction-threshold-setting.js';
import { IdleCompactionSetting } from './idle-compaction-setting.js';
import { DefaultModelSettings, OnboardingSetting } from './onboarding-view.js';
import { RoutingGroupSettings } from './routing-group-settings.js';
import { ConnectionsPage } from './connections-dialog.js';
import type { BotSettingsSectionOwnerProps } from './bot-settings-slot.js';
import { ProfileBackupSettings } from './profile-backup.js';
import type { ReleaseNotesController } from './release-notes.js';
import { ReleaseSettings } from './release-notes-view.js';
import { PluginsSettings } from './plugin-updates-view.js';
import type { UpdateRunsController } from './update-runs.js';
import type { ClientStore } from './store.js';
import { TelemetrySettings } from './telemetry-settings.js';
import type { WindowCompanions } from './window-companions.js';
import { CompanionSettings } from './window-companions-view.js';

type SectionProps<Face extends object> = PropsLocale<'botharness'> & InjectFace<Face>;

function Rows({ children }: { children: ReactNode }): ReactElement {
  return <SettingsRows>{children}</SettingsRows>;
}

export type LocaleSource = Pick<LocaleRuntime, 'getSnapshot' | 'subscribe' | 'setLocale'>;

export type GeneralSectionFace = BotModePrefsFace & {
  zoomSurface: ZoomSurface;
  actions: BridgeActions;
  closeBotSettings(): void;
  localeSource: LocaleSource;
};

function LanguageSetting({
  localeSource,
  t,
}: {
  localeSource: LocaleSource;
  t: SectionProps<object>['t'];
}): ReactElement {
  const locale = useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot);
  return (
    <SettingsRow
      title={t('settings.language')}
      control={
        <Select
          label={t('settings.language')}
          value={locale.active}
          options={locale.locales.map((item) => ({ value: item.id, label: item.label }))}
          onChange={localeSource.setLocale}
        />
      }
    />
  );
}
export type MessagingSectionFace = BotModePrefsFace & {
  call: BridgeCall;
  store: ClientStore;
  onSaved(): Promise<void>;
};

export function AccountSection(
  props: SectionProps<{
    actions: BridgeActions;
    startSignIn(): Promise<ConnectSignInCode>;
    call: BridgeCall;
    store: ClientStore;
    onSaved(): Promise<void>;
  }>,
): ReactElement {
  return (
    <Rows>
      <SettingsSection
        title={props.t('profile.section.chat')}
        description={props.t('profile.section.chatHint')}
        data={{ 'data-chat-profile': '' }}
      >
        <HumanAvatarSettings actions={props.actions} t={props.t} />
        <HumanNameSettings
          call={props.call}
          store={props.store}
          onSaved={props.onSaved}
          t={props.t}
        />
      </SettingsSection>
      <AccountProfileSettings
        actions={props.actions}
        startSignIn={props.startSignIn}
        uploads={<MyUploadsSettingsRow actions={props.actions} t={props.t} />}
        t={props.t}
      />
    </Rows>
  );
}

export function GeneralSection(props: SectionProps<GeneralSectionFace>): ReactElement {
  return (
    <Rows>
      <SettingsSection title={props.t('general.section.language')}>
        <LanguageSetting localeSource={props.localeSource} t={props.t} />
        <WindowZoomSettings surface={props.zoomSurface} t={props.t} />
        <WindowZoomSetup surface={props.zoomSurface} t={props.t} />
      </SettingsSection>
      <SettingsSection title={props.t('general.section.motion')}>
        <MotionSetting {...props} />
      </SettingsSection>
      <SettingsSection title={props.t('general.section.onboarding')}>
        <OnboardingSetting
          actions={props.actions}
          closeBotSettings={props.closeBotSettings}
          t={props.t}
        />
      </SettingsSection>
    </Rows>
  );
}

export function ModelsSection(
  props: SectionProps<BotModePrefsFace & { actions: BridgeActions; call: BridgeCall }>,
): ReactElement {
  return (
    <Rows>
      <SettingsSection title={props.t('models.section.default')}>
        <DefaultModelSettings actions={props.actions} t={props.t} />
      </SettingsSection>
      <RoutingGroupSettings actions={props.actions} t={props.t} />
      <SettingsSection title={props.t('models.section.mode')}>
        <BotModeDefaultSetting actions={props.actions} t={props.t} />
      </SettingsSection>
      <BotModeTemplateSettings actions={props.actions} t={props.t} />
      <SettingsSection title={props.t('models.section.context')}>
        <IdleCompactionSetting call={props.call} t={props.t} />
        <CompactionThresholdSetting call={props.call} t={props.t} />
      </SettingsSection>
      <SettingsSection title={props.t('models.section.run')}>
        <AssignmentConcurrencyRow {...props} />
      </SettingsSection>
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

export function PromptsSection(props: SectionProps<{ actions: BridgeActions }>): ReactElement {
  return (
    <Rows>
      <PromptPresetSettings actions={props.actions} t={props.t} />
    </Rows>
  );
}

export function VoiceSection(props: SectionProps<{ actions: BridgeActions }>): ReactElement {
  return (
    <Rows>
      <VoiceProviderSettings actions={props.actions} t={props.t} />
    </Rows>
  );
}

export function MessagingSection(props: SectionProps<MessagingSectionFace>): ReactElement {
  return (
    <Rows>
      <SettingsSection title={props.t('messaging.section.input')}>
        <SendKeySetting {...props} />
      </SettingsSection>
      <SettingsSection title={props.t('messaging.section.display')}>
        <AutoCollapseMessagesSetting {...props} />
        <DmAvatarSetting {...props} />
        <OwnAvatarSetting {...props} />
        <DeliveryReceiptsSetting {...props} />
        <StreamRepliesSetting {...props} />
      </SettingsSection>
      <SettingsSection title={props.t('sessions.settings.section')}>
        <SessionDetailLevelSetting {...props} />
        <SessionCollapseSetting {...props} />
        <SessionFoldedRepliesSetting {...props} />
      </SettingsSection>
      <SettingsSection title={props.t('messaging.section.bots')}>
        <GroupAutoAcceptSetting {...props} />
        <BotHopLimitRow {...props} />
      </SettingsSection>
    </Rows>
  );
}

export function CompanionsSection({
  companion,
  t,
}: SectionProps<{ companion: WindowCompanions }>): ReactElement {
  return (
    <SettingsSection>
      <CompanionSettings companion={companion} t={t} />
    </SettingsSection>
  );
}

export function DevicesSection({
  t,
  pairPhone,
  joinComputer,
}: PropsLocale<'botharness'> & BotSettingsSectionOwnerProps): ReactElement {
  return <ConnectionsPage t={t} pairPhone={pairPhone} joinComputer={joinComputer} />;
}

export function DataPrivacySection({ call, t }: SectionProps<{ call: BridgeCall }>): ReactElement {
  return (
    <Rows>
      <ProfileBackupSettings t={t} />
      <TelemetrySettings call={call} t={t} />
      <StorageSettings call={call} t={t} />
      <DataResetSettings call={call} t={t} />
    </Rows>
  );
}

export function AdvancedSection(
  props: SectionProps<BotModePrefsFace & { call: BridgeCall }>,
): ReactElement {
  return (
    <Rows>
      <SettingsSection title={props.t('advanced.section.developer')}>
        <DeveloperModeSetting {...props} />
        <BotSessionsVisibilitySetting {...props} />
        <ApprovalReviewSessionsVisibilitySetting {...props} />
      </SettingsSection>
      <SettingsSection>
        <GitSettings call={props.call} t={props.t} />
      </SettingsSection>
    </Rows>
  );
}

export function AboutSection({
  releaseNotes,
  call,
  updateRuns,
  t,
}: SectionProps<{
  releaseNotes: ReleaseNotesController;
  call: BridgeCall;
  updateRuns: UpdateRunsController;
}>): ReactElement {
  return (
    <Rows>
      <SettingsSection title={t('about.section.version')}>
        <ReleaseSettings releaseNotes={releaseNotes} t={t} />
        <SettingsRow
          title={t('build.row.title')}
          description={<span data-build-id>{buildLabel(clientBuild())}</span>}
        />
      </SettingsSection>
      <PluginsSettings
        call={call}
        updateRuns={updateRuns}
        title={t('about.section.plugins')}
        t={t}
      />
    </Rows>
  );
}

export function registerModelSettingsSections(
  settingsCtx: ClientContext,
  {
    t,
    prefs,
    actions,
    call,
    store,
  }: {
    t: SectionProps<object>['t'];
    prefs: BotModePrefs;
    actions: BridgeActions;
    call: BridgeCall;
    store: ClientStore;
  },
): void {
  settingsCtx.slots.inject('botharness.settings.section', () =>
    settingsCtx.slots.register(
      {
        name: 'botharness.settings.section',
        id: BOT_SETTINGS_SECTIONS.modelProviders,
        order: 9,
        label: () => t('botSettings.section.modelProviders'),
        locale: LOCALE_NS,
        inject: () => ({ call }),
      },
      ModelProvidersSettings,
    ),
  );
  settingsCtx.slots.inject('botharness.settings.section', () =>
    settingsCtx.slots.register(
      {
        name: 'botharness.settings.section',
        id: BOT_SETTINGS_SECTIONS.models,
        order: 10,
        label: () => t('botSettings.section.models'),
        locale: LOCALE_NS,
        inject: () => ({ ...botModePrefsFace(prefs), actions, call }),
      },
      ModelsSection,
    ),
  );
  settingsCtx.slots.inject('botharness.settings.section', () =>
    settingsCtx.slots.register(
      {
        name: 'botharness.settings.section',
        id: BOT_SETTINGS_SECTIONS.autoApproval,
        order: 15,
        label: () => t('botSettings.section.autoApproval'),
        locale: LOCALE_NS,
        inject: () => ({ actions, call, store }),
      },
      AutoApprovalSection,
    ),
  );
}

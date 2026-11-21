import type { Appearance } from '../../appearance.js';
import { onboardingFor, type OnboardingViewState } from '../../onboarding.js';
import type { WorkspaceOptions } from '../../workspace.js';
import { OnboardingOverlay } from '../../onboarding-view.js';
import { BotIntro } from '../../bot-intro.js';
import type { BotSettings } from '../../bot-settings.js';
import type { Wallpaper } from '../../wallpaper.js';
import { CompactNavigationHeader } from '../../mobile-conversation-header.js';
import type { WindowCompanions } from '../../window-companions.js';
import type { BridgeCall } from '../../bridge.js';
import { useSyncExternalStore, type ReactElement } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { BotModePrefs } from '../../bot-mode-prefs.js';
import type { NativeChatFailureText } from '../../channel-message-body.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { NativeSessionCatalog } from '../../sessions-entry.js';
import type { ChannelSidebarRegistry } from '../../channel-sidebar.js';
import type { DockPanelHost } from '../../dock-panels.js';
import type { ProfileCardRegistry } from '../../profile-cards.js';
import { store } from '../../store.js';
import { useMountedResource } from '../../mounted-resource.js';
import type { ReleaseNotesController } from '../../release-notes.js';
import { ReleaseNotesAnnouncement } from '../../release-notes-view.js';
import type { TelemetryNoticeController } from '../../telemetry-notice.js';
import { TelemetryNotice } from '../../telemetry-notice-view.js';
import { BotMain } from '../../bot-main.js';

function releaseDeferred(state: OnboardingViewState): boolean {
  return (
    state.modelOpen ||
    state.sendOpen ||
    state.guideOpen ||
    state.checklistOpen ||
    state.sessionsTourOpen ||
    state.intro !== undefined ||
    (state.receipt === undefined && state.error === undefined)
  );
}

export function BotPanel({
  appearance,
  call,
  botSettings,
  wallpaper,
  openCompactSidebar,
  workspace,
  prefs,
  actions,
  companion,
  nativeSessions,
  channelSidebar,
  dockPanels,
  profileCards,
  nativeChatT,
  releaseNotes,
  telemetryNotice,
  t,
}: {
  openCompactSidebar?: Parameters<typeof CompactNavigationHeader>[0]['openSidebar'] | undefined;
  call?: BridgeCall | undefined;
  botSettings?: Pick<BotSettings, 'open' | 'subscribe' | 'getSnapshot'> | undefined;
  prefs?: Pick<BotModePrefs, 'source'> | undefined;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  dockPanels?: DockPanelHost | undefined;
  nativeSessions?: NativeSessionCatalog | undefined;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  releaseNotes?: ReleaseNotesController | undefined;
  telemetryNotice?: TelemetryNoticeController | undefined;
  appearance?: Appearance | undefined;
  wallpaper?: Wallpaper | undefined;
  workspace?: WorkspaceOptions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const onboarding = onboardingFor(actions);
  const deferRelease = useSyncExternalStore(onboarding.subscribe, () =>
    releaseDeferred(onboarding.getSnapshot()),
  );
  const modeMount = useMountedResource<HTMLSpanElement>(() => {
    store.setMode('bot');
    return () => {
      store.setMode('dsh');
    };
  }, []);
  return (
    <>
      <span ref={modeMount} hidden aria-hidden="true" />
      <OnboardingOverlay actions={actions} companion={companion} t={t} />
      <BotIntro
        actions={actions}
        call={call}
        botSettings={botSettings}
        appearance={appearance}
        wallpaper={wallpaper}
        t={t}
      />
      {releaseNotes === undefined ? null : (
        <ReleaseNotesAnnouncement controller={releaseNotes} t={t} deferred={deferRelease} />
      )}
      {telemetryNotice === undefined ? null : (
        <TelemetryNotice controller={telemetryNotice} releaseNotes={releaseNotes} t={t} />
      )}
      <BotMain
        appearance={appearance}
        workspace={workspace}
        openCompactSidebar={openCompactSidebar}
        prefs={prefs}
        actions={actions}
        companion={companion}
        nativeSessions={nativeSessions}
        channelSidebar={channelSidebar}
        dockPanels={dockPanels}
        profileCards={profileCards}
        nativeChatT={nativeChatT}
        t={t}
      />
    </>
  );
}

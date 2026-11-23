import { canManageModelProviders } from './team-bridge.js';
import { currentTeamMode } from './team-state.js';
import { CHANNEL_BODY_PANEL, readChannelDock, writeChannelDock } from './channel-dock-layout.js';
import { markOriginActions } from './origin-actions.js';
import { rewriteHasSiblingRules } from './has-sibling-rewrite.js';
import { createBotPresentation } from './bot-presentation.js';
import { disposeClientLog, installClientLog } from './diagnostic-log.js';
import { watchClientLogState } from './diagnostic-log-state.js';
import { telemetrySurface } from './telemetry-surface.js';
import { mountWindowZoomControl } from './window-zoom-control.js';
import { mountPresenceReporter, presenceSender } from './presence-reporter.js';
import { mountWindowZoom, type ZoomCompatibility } from './window-zoom-mount.js';
import { Wallpaper } from './wallpaper.js';
import { createWallpaperStore } from './wallpaper-store.js';
import { mountWallpaper } from './wallpaper-layer.js';
import { mountPanelScrollbars, PLUGIN_SCROLLBAR_SCOPE } from './ds/panel-scrollbars.js';
import { panelTargetId } from './appearance-panels.js';
import { refreshBotPrimaryColors } from './bot-primary-color.js';
import { Appearance } from './appearance.js';
import { mountAppearance } from './appearance-scope.js';
import { mountAppearanceControl } from './appearance-control.js';
import { recordRemoteHosts, remoteHosts } from './remote-hosts.js';
import { bindBotAppearance } from './bot-color-scheme.js';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import { setWorkShortcutNotice } from './keyboard-settings.js';
import { createElement } from 'react';
import { bindTobPresentation } from './tob-presentation.js';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { registerWorkspaceShortcuts, migrateWorkShortcut } from './workspace-shortcuts.js';
import { startAccountEnvironments } from './account-environments.js';
import type {} from '@deepseek-ai/dsh-client-shortcuts/client';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

import { DEFAULT_SETTINGS_PINS } from '@botharness/host-client/shared/bot-mode-settings';
import {
  fullClientLocator,
  privateInputLocator,
} from '../../../core/src/credentials/web-locator.js';
import { requestCreation } from './create-request.js';
import { watchFullClientLanding, watchPrivateInputNavigation } from './private-input-navigation.js';
import { createNativeHostFiles } from './host-file-actions.js';
import { createFileOpenPreferences } from './file-open-preferences.js';
import { createActions, type BridgeActions } from './actions.js';
import { ProviderAppSetup } from './provider-app-setup.js';
import { BotModePrefs } from './bot-mode-prefs.js';
import type { SettingsPins } from './settings-home.js';
import {
  BotSessionFolders,
  mountBotFolderProjection,
  type NativeBotFolderMount,
  type BotSessionGroup,
} from './bot-session-folders.js';
import {
  createBotSessionVisibility,
  mountBotSessionVisibility,
  type WorkspaceListSnapshot,
} from './bot-session-visibility.js';
import {
  BOT_SETTINGS_SECTIONS,
  BotSettings,
  BotSettingsView,
  botSettingsSectionSource,
} from './bot-settings.js';
import type { QuickSwitcherSettings } from './quick-switcher.js';
import { createQuickSwitcherLauncher } from './quick-switcher-launcher.js';
import { searchSettings } from './settings-search.js';
import { memberPage } from './member-page.js';
import { ReleaseNotesController } from './release-notes.js';
import { UpdateRunsController } from './update-runs.js';
import { TelemetryNoticeController } from './telemetry-notice.js';
import './bot-settings-slot.js';
import { clearConversationDrafts } from './conversation-draft.js';
import { HostAcknowledgements, installHostAcknowledgements } from './host-acknowledgements.js';
import {
  createChannelSidebarBuiltinTabs,
  createChannelSidebarBuiltins,
} from './channel-sidebar-builtins.js';
import { webShortcutBlocked, webModalOpen, webShortcutHelpQuestion } from './channel-shortcuts.js';
import { ShortcutBindings } from './shortcut-bindings.js';
import { mountSettingsShortcut } from './settings-shortcut.js';
import {
  browserNotificationApi,
  DesktopNotificationPrefs,
  mountDesktopNotifications,
} from './desktop-notifications.js';
import { openHumanAttentionSource } from './human-attention-source.js';
import { HumanProfileSetup } from './human-profile-setup.js';
import { mountTabTitle } from './tab-title.js';
import { createChannelSidebarRegistry } from './channel-sidebar.js';
import { createDockPanelRegistry } from './dock-panels.js';
import { createActivityCenterPanel } from './activity-center-panel.js';
import { createEnvironmentPanel, openEnvironmentJoin } from './environment-panel.js';
import { mountHostSettingsOpener } from './environment-settings-source.js';
import { createMarketPanel } from './market-panel.js';
import { createProfileCardBuiltins } from './profile-cards-builtins.js';
import { createGroupProfileCards } from './group-profile.js';
import { createProfileCardRegistry } from './profile-cards.js';
import {
  createBridgeCall,
  connectionRpc,
  loadBotSessionGroups,
  loadHumanAttention,
  botExists,
  bridgeHost,
} from './bridge.js';
import { listBots } from '@botharness/host-client/bots';
import { observeHumanAttention, observeResource } from './messaging-defaults-live.js';
import type { CompanionSource } from './live-snapshots.js';
import { sessionBotReference } from './mentions.js';
import { en, LOCALE_NS, zh } from './locale.js';
import { browserSystemMotionSource, mountMotionPolicyAttribute } from './motion-preference.js';
import { trackDialogInput } from './ds/dialog-input.js';
import { defaultStorage, loadRosterConfig } from './roster-config.js';
import { mountDevClientRefresh } from './dev-client-refresh.js';
import { saveHmrView, takeHmrView } from './hmr-view.js';
import { consumeLastView, writeLastView } from './last-view.js';
import { migrateLegacyRoster } from './roster-migration.js';
import { store } from './store.js';
import { WindowCompanions } from './window-companions.js';
import { WindowCompanionsView } from './window-companions-view.js';

import { mountClientLive } from './client-live.js';
import { panelInfoOf, registerClientPanels } from './client-panel-registration.js';
import { registerClientSettings } from './client-settings-registration.js';
import { installStyles } from './install-client-styles.js';

export { installStyles } from './install-client-styles.js';

export const name = 'botharness-client';

export const inject = [
  'slots',
  'shortcuts',
  'connection',
  'inputTriggers',
  'layout',
  'locale',
  'theme',
  'sessions',
  'uiWorkspace',
  'workspaces',
  'remote',
  'remote.session',
];

export const PANEL_ID = 'botharness' as MainPanelId;

export function apply(ctx: ClientContext): void {
  const member = memberPage();
  ctx.effect(() => clearConversationDrafts);
  ctx.effect(() => {
    if (typeof window === 'undefined' || member) return () => {};
    installClientLog({ window, surface: telemetrySurface() });
    const offStore = watchClientLogState(store);
    return () => {
      offStore();
      disposeClientLog();
    };
  }, 'botharness: always-on local diagnostic log');
  const storage = defaultStorage();
  const wallpaper = new Wallpaper(
    createWallpaperStore(typeof indexedDB === 'undefined' ? undefined : indexedDB),
  );
  const appearance = new Appearance(storage, () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const offScheme = bindBotAppearance(appearance);
    const offStyle = mountAppearance(appearance);
    const offColors = appearance.subscribe(refreshBotPrimaryColors);
    refreshBotPrimaryColors();
    const offWallpaper = mountWallpaper(wallpaper);
    const offScrollbars = mountPanelScrollbars(document.documentElement, PLUGIN_SCROLLBAR_SCOPE);
    const offControl = member ? () => {} : mountAppearanceControl(appearance, wallpaper);
    return () => {
      offControl();
      offScrollbars();
      offWallpaper();
      offColors();
      offStyle();
      offScheme();
    };
  });
  const hmrView =
    typeof window === 'undefined'
      ? undefined
      : takeHmrView(window as unknown as Record<string, unknown>);
  const t = ctx.locale.bind(LOCALE_NS);
  if (!member) {
    remoteHosts(t);
    ctx.effect(
      () =>
        startAccountEnvironments({
          sources: remoteHosts(t),
          clientName: t('relationships.clientDefault'),
        }),
      'botharness: same-account environments',
    );
  }
  const zoom = mountWindowZoom({
    document: typeof document === 'undefined' ? undefined : document,
    window: typeof window === 'undefined' ? undefined : window,
    shortcuts: ctx.shortcuts,
    storage,
    onReady: mountWindowZoomControl,
    compatibility:
      typeof window === 'undefined'
        ? undefined
        : (
            window as unknown as {
              __botharnessWindowZoomCompatibility?: ZoomCompatibility;
            }
          ).__botharnessWindowZoomCompatibility,
    t,
  });
  ctx.effect(() => () => zoom.dispose(), 'botharness: device-local window zoom');
  const nativeChatT = ctx.locale.bind('chat');
  const call = createBridgeCall(ctx);
  const profileContext = async (): Promise<{ profileId: string }> => {
    const response = await fetch('./api/botharness/companion', {
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Companion context unavailable');
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('profileId' in value) ||
      typeof value.profileId !== 'string'
    )
      throw new Error('Invalid Companion context');
    return { profileId: value.profileId };
  };
  const actions: BridgeActions = createActions(call, store, {
    openModelPresets: () => botSettings.open(BOT_SETTINGS_SECTIONS.modelPresets),
    ...(member ? {} : { nativeFiles: createNativeHostFiles(ctx.remote.session) }),
    fileOpenPreferences: createFileOpenPreferences({
      storage,
      context: profileContext,
    }),
    pickDirectory: () => {
      const picker = ctx.get('uiWorkspace');
      if (picker === undefined) throw new Error('DSH folder picker is unavailable');
      return picker.pickDirectory();
    },
    createWorkspace: (input) => {
      const workspaces = ctx.get('workspaces');
      if (workspaces === undefined) throw new Error('DSH Workspace controller is unavailable');
      return workspaces.create(input);
    },
    openSession: (sessionId) => {
      ctx.layout.selectPanel(null);
      ctx.uiWorkspace.openSession(sessionId as SessionId);
    },
  });
  markOriginActions(actions);
  const setupRpc = connectionRpc(ctx);
  if (setupRpc) actions.appSetup = new ProviderAppSetup(setupRpc);
  recordRemoteHosts((event, properties) => actions.telemetryEvent(event, properties));
  let companionSource: ((url: string) => CompanionSource) | undefined;
  const companion = new WindowCompanions({
    storage,
    exists: (botId) => botExists(call, botId),
    context: profileContext,
    source: (url) => companionSource?.(url) ?? new EventSource(url),
    update: async (value) => {
      const response = await fetch('./api/botharness/companion', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error('Companion subscription unavailable');
    },
  });
  ctx.effect(() => {
    if (member) return () => {};
    void companion.start();
    return () => companion.dispose();
  }, 'botharness: independent Window Companion owner');
  const prefs = new BotModePrefs(storage);
  ctx.effect(
    () =>
      bindTobPresentation({
        bot: (slug) => store.getSnapshot().bots.find((bot) => bot.slug === slug),
        icon: () => prefs.source.getSnapshot().botIcon,
        subscribe(listener) {
          const offStore = store.subscribe(listener);
          const offPrefs = prefs.source.subscribe(listener);
          return () => {
            offStore();
            offPrefs();
          };
        },
      }),
    'botharness: Tob presentation',
  );
  const botFolderGroups = createSnapshotStore<readonly BotSessionGroup[]>([]);
  const botFolderHost = createSnapshotStore<HTMLElement | null>(null);
  let botFolderMount: NativeBotFolderMount | undefined;
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-bot-session-folders',
        locale: LOCALE_NS,
        inject: () => ({
          storage,
          openSession: (id: string) => ctx.uiWorkspace.openSession(id as SessionId),
          roster: store,
          hooks: {
            botFolderGroups,
            botFolderPrefs: prefs.source,
            botFolderHost,
          },
          setMounted: (node: HTMLElement | null) => botFolderMount?.setMounted(node),
        }),
      },
      BotSessionFolders,
    ),
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-human-profile-setup',
        locale: LOCALE_NS,
        inject: () => ({ call, actions }),
      },
      HumanProfileSetup,
    ),
  );
  const botSettings = new BotSettings(() =>
    openEnvironmentJoin(dockPanels, () => ctx.layout.selectPanel(PANEL_ID)),
  );
  ctx.effect(() => mountHostSettingsOpener(botSettings.openHost));
  const desktopNotifications = new DesktopNotificationPrefs(storage, browserNotificationApi());
  const shortcutBindings = new ShortcutBindings(storage);
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-window-companion',
        locale: LOCALE_NS,
        inject: () => ({
          companion,
          prefs,
          actions,
          dropIn: true,
          openDm: (botId: string) => {
            ctx.layout.selectPanel(PANEL_ID);
            void actions.openBot(botId);
          },
          openChannel: async (channelId: string, messageId: string) => {
            await actions.openChannelAtMessage(channelId, messageId);
            ctx.layout.selectPanel(PANEL_ID);
          },
          openAttention: () => {
            ctx.layout.selectPanel(PANEL_ID);
            void actions.openActivityCenter();
          },
          openSettings: () => {
            botSettings.open(BOT_SETTINGS_SECTIONS.companions);
          },
        }),
      },
      WindowCompanionsView,
    ),
  );
  const botSettingsSections = botSettingsSectionSource(ctx);
  const settingsPins: SettingsPins = {
    getSnapshot: () => prefs.source.getSnapshot().settingsPins ?? DEFAULT_SETTINGS_PINS,
    subscribe: (listener) => prefs.source.subscribe(listener),
    set: (pins) => {
      prefs.setSettingsPins(pins);
    },
  };
  const quickSwitcherSettings: QuickSwitcherSettings = {
    search: (query) =>
      searchSettings(
        botSettingsSections
          .getSnapshot()
          .filter(
            ({ id }) =>
              id !== BOT_SETTINGS_SECTIONS.modelProviders ||
              canManageModelProviders(currentTeamMode(call)?.viewer),
          ),
        query,
        t,
      ),
    open: (result) => botSettings.open(result.section, result.target),
    launcher: createQuickSwitcherLauncher(),
  };
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-bot-settings',
        locale: LOCALE_NS,
        inject: () => ({
          botSettings,
          call,
          sections: botSettingsSections,
          environments: member ? undefined : remoteHosts(t),
          pins: member ? undefined : settingsPins,
        }),
        children: {
          'botharness.settings.section': { kind: 'list', scope: 'root' },
        },
      },
      BotSettingsView,
    ),
  );
  const updateRuns = new UpdateRunsController(call);
  const acknowledgements = new HostAcknowledgements(call, storage);
  ctx.effect(() => installHostAcknowledgements(acknowledgements), 'botharness: Profile notices');
  void acknowledgements.load();
  const releaseNotes = new ReleaseNotesController(
    call,
    storage,
    undefined,
    updateRuns,
    acknowledgements,
  );
  const telemetryNotice = new TelemetryNoticeController(
    call,
    storage,
    () => {
      botSettings.open(BOT_SETTINGS_SECTIONS.dataPrivacy);
    },
    acknowledgements,
  );
  const lastView =
    typeof window === 'undefined'
      ? undefined
      : consumeLastView(window as unknown as Record<string, unknown>, storage);
  const restoreBotMode = member || (hmrView === undefined && lastView?.mode === 'bot');
  const nativeSessions = {
    refresh: () => ctx.sessions.refresh(),
    subscribe: (listener: () => void) => ctx.sessions.list.subscribe(listener),
    getSnapshot: () => ctx.sessions.list.getSnapshot(),
  };
  ctx.effect(() => {
    if ((ctx as { sessions?: { list?: unknown } }).sessions?.list === undefined) return () => {};
    const workspaceList = ((ctx as { workspaces?: { list?: unknown } }).workspaces
      ?.list as unknown as
      | {
          subscribe(listener: () => void): () => void;
          getSnapshot(): WorkspaceListSnapshot | undefined;
        }
      | undefined) ?? {
      subscribe: () => () => {},
      getSnapshot: () => undefined,
    };
    const controller = new AbortController();
    if (typeof document !== 'undefined')
      botFolderMount = mountBotFolderProjection({
        sessions: nativeSessions,
        workspaces: workspaceList,
        prefs: prefs.source,
        groups: botFolderGroups,
        setHost: (host) => botFolderHost.set(host),
      });
    const visibility = createBotSessionVisibility({
      sessions: nativeSessions,
      workspaces: workspaceList,
      prefs: prefs.source,
      loadBotSessionIds: async () => {
        const groups = await loadBotSessionGroups(call, controller.signal);
        if (!controller.signal.aborted) botFolderGroups.set(groups);
        return groups.flatMap((group) => group.sessionIds);
      },
      warn: (message, error) => ctx.logger.warn(message, error),
    });
    let roster = '';
    let rosterBots: unknown;
    const offRoster = store.subscribe(() => {
      const bots = store.getSnapshot().bots;
      if (bots === rosterBots) return;
      rosterBots = bots;
      const next = JSON.stringify(bots.map((bot) => [bot.slug, bot.displayName]));
      if (next === roster) return;
      roster = next;
      visibility.refresh();
    });
    const unmount = mountBotSessionVisibility(visibility);
    return () => {
      controller.abort();
      botFolderMount?.dispose();
      botFolderMount = undefined;
      offRoster();
      unmount();
      visibility.dispose();
    };
  }, 'botharness: Bot Session visibility');
  const presentation = createBotPresentation(store);
  ctx.provide('botPresentation', presentation);
  ctx.effect(() => () => presentation.dispose());
  const dockPanels = createDockPanelRegistry({
    instances: readChannelDock()?.instances ?? [],
    saveInstances(instances) {
      const current = readChannelDock();
      if (!current || !writeChannelDock({ ...current, instances }))
        throw new Error('panel_layout_unavailable');
    },
  });
  ctx.provide('dockPanels', dockPanels);
  ctx.effect(() =>
    appearance.setTargetSource(() => [
      ...dockPanels.panels().map((panel) => ({ id: panelTargetId(panel.id), label: panel.title })),
      {
        id: panelTargetId('memory-details'),
        label: t('appearance.memoryDetails'),
      },
      {
        id: panelTargetId('generated-files'),
        label: t('generatedFiles.title'),
      },
    ]),
  );
  const channelSidebar = createChannelSidebarRegistry(dockPanels);
  const workspace = {
    actions,
    companion,
    channelSidebar,
    dockPanels,
    shortcutBindings,
    prefs,
    layout: ctx.layout,
    shortcuts: ctx.shortcuts,
    registerLayoutSettings: (setTarget: (node: HTMLDivElement | null) => void) =>
      ctx.slots.inject('botharness.settings.layout', () =>
        ctx.slots.register(
          {
            name: 'botharness.settings.layout',
            id: 'workspace-layout',
            order: 5,
            label: () => t('workspace.appearance'),
            locale: LOCALE_NS,
          },
          () => createElement('div', { ref: setTarget }),
        ),
      ),
    exitBotMode: member ? undefined : () => ctx.layout.selectPanel(null),
    openBotSettings: (sectionId?: string) => botSettings.open(sectionId),
    quickSwitcherSettings,
  };

  ctx.effect(() =>
    registerWorkspaceShortcuts(
      ctx.shortcuts,
      dockPanels,
      () => document.querySelector('[data-workspace-enabled]') !== null,
      t,
      () => {
        dockPanels.open(CHANNEL_BODY_PANEL);
        void actions
          .tobHome()
          .then((tob) =>
            typeof tob.channelId === 'string' ? actions.openChannel(tob.channelId) : undefined,
          )
          .catch(() => {});
      },
    ),
  );
  ctx.effect(() =>
    migrateWorkShortcut(ctx.shortcuts, () => {
      setWorkShortcutNotice(true);
      botSettings.open(BOT_SETTINGS_SECTIONS.shortcuts);
    }),
  );
  ctx.provide('channelSidebar', channelSidebar);
  ctx.provide('botharnessResourceObserver', (resource, refresh) =>
    observeResource(resource, refresh, 10_000, 60_000, true),
  );
  const profileCards = createProfileCardRegistry();
  ctx.provide('profileCards', profileCards);
  ctx.effect(() => {
    let disposers: (() => void)[] = [];
    const reconcile = (): void => {
      for (const dispose of disposers) dispose();
      disposers = [
        ...createChannelSidebarBuiltinTabs(t).map((tab) => channelSidebar.registerTab(tab)),
        ...createChannelSidebarBuiltins(t, prefs, nativeSessions).map((entry) =>
          channelSidebar.register(entry),
        ),
        dockPanels.register(createActivityCenterPanel(actions, t, dockPanels)),
        ...(member ? [] : [dockPanels.register(createEnvironmentPanel(t))]),
        dockPanels.register(createMarketPanel(actions, dockPanels, t)),
      ];
    };
    reconcile();
    const unsubscribe = ctx.locale.subscribe(reconcile);
    return () => {
      unsubscribe();
      for (const dispose of disposers) dispose();
    };
  }, 'botharness: Channel sidebar entries');

  ctx.effect(() => {
    let disposers: (() => void)[] = [];
    const reconcile = (): void => {
      for (const dispose of disposers) dispose();
      disposers = [
        ...createProfileCardBuiltins(t).map((card) => profileCards.register(card)),
        ...createGroupProfileCards(t).map((card) => profileCards.registerGroup(card)),
      ];
    };
    reconcile();
    const unsubscribe = ctx.locale.subscribe(reconcile);
    return () => {
      unsubscribe();
      for (const dispose of disposers) dispose();
    };
  }, 'botharness: Profile Cards');

  ctx.effect(installStyles, 'botharness: client styles');
  ctx.effect(
    () => (typeof document === 'undefined' ? () => {} : rewriteHasSiblingRules(document)),
    'botharness: cheap :has() invalidation for host sheets',
  );
  ctx.effect(mountDevClientRefresh, 'botharness: local development refresh');
  ctx.effect(
    () => prefs.attachSystemMotion(browserSystemMotionSource()),
    'botharness: system motion preference',
  );
  ctx.effect(
    () => (typeof document === 'undefined' ? () => {} : trackDialogInput(document)),
    'botharness: dialog input modality',
  );
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return mountMotionPolicyAttribute(prefs.source, document.documentElement);
  }, 'botharness: motion policy boundary');
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness: dictionaries');
  ctx.effect(() => {
    const reconcile = () => store.setDefaultTobName(t('tob.defaultName'));
    reconcile();
    return ctx.locale.subscribe(reconcile);
  }, 'botharness: localized Tob name');
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!shortcutBindings.matches('bot-mode', event)) {
        return;
      }
      if (webShortcutBlocked(event.target, document)) return;
      event.preventDefault();
      ctx.layout.selectPanel(store.getSnapshot().mode === 'bot' ? null : PANEL_ID);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, 'botharness: Bot mode keyboard shortcut');
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const onKeyDown = (event: KeyboardEvent): void => {
      if (store.getSnapshot().mode !== 'bot') return;
      const trigger = shortcutBindings.matches('help', event)
        ? 'binding'
        : webShortcutHelpQuestion(event.key, {
              ctrl: event.ctrlKey,
              meta: event.metaKey,
              alt: event.altKey,
              altGraph: event.getModifierState('AltGraph'),
              composing: event.isComposing,
              repeat: event.repeat,
              prevented: event.defaultPrevented,
            })
          ? 'question'
          : undefined;
      if (trigger === undefined) return;
      if (
        botSettings.getSnapshot().open &&
        botSettings.getSnapshot().sectionId === BOT_SETTINGS_SECTIONS.shortcuts
      ) {
        event.preventDefault();
        botSettings.close();
        return;
      }
      if (
        trigger === 'question' ? webShortcutBlocked(event.target, document) : webModalOpen(document)
      )
        return;
      event.preventDefault();
      botSettings.open(BOT_SETTINGS_SECTIONS.shortcuts);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, 'botharness: keyboard shortcut list');
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return mountSettingsShortcut({
      document,
      bindings: shortcutBindings,
      botSettings,
      active: () => store.getSnapshot().mode === 'bot',
    });
  }, 'botharness: Bot settings keyboard shortcut');
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return mountTabTitle(store, document);
  }, 'botharness: tab title attention count');
  ctx.effect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
    return mountDesktopNotifications({
      prefs: desktopNotifications,
      load: async () => {
        const [action, replies, unread] = await Promise.all([
          loadHumanAttention(call, 'action', 20),
          loadHumanAttention(call, 'replies', 20),
          loadHumanAttention(call, 'unread', 20),
        ]);
        return [...action.items, ...replies.items, ...unread.items];
      },
      channels: () => store.getSnapshot().channels,
      attentive: () => document.visibilityState === 'visible' && document.hasFocus(),
      subscribe: (listener) => {
        let prior = store.getSnapshot().activityList;
        const offStore = store.subscribe(() => {
          const next = store.getSnapshot().activityList;
          if (next.unreadCount === prior.unreadCount && next.hasAction === prior.hasAction) return;
          prior = next;
          listener();
        });
        const offPrefs = desktopNotifications.subscribe(listener);
        const offAttention = observeHumanAttention(listener);
        document.addEventListener('visibilitychange', listener);
        window.addEventListener('focus', listener);
        window.addEventListener('blur', listener);
        return () => {
          offStore();
          offPrefs();
          offAttention();
          document.removeEventListener('visibilitychange', listener);
          window.removeEventListener('focus', listener);
          window.removeEventListener('blur', listener);
        };
      },
      title: (kind, item) => {
        const bot =
          store.getSnapshot().bots.find((candidate) => candidate.slug === item.botSlug)
            ?.displayName ??
          (item.botSlug || item.channelName) ??
          '';
        return t(`desktopNotify.${kind}`, {
          bot,
          channel: item.channelName ?? '',
        });
      },
      open: (item) => {
        ctx.layout.selectPanel(PANEL_ID);
        void openHumanAttentionSource(actions, item).catch((error: unknown) => {
          ctx.logger.warn('botharness: failed to open notification source', error);
        });
      },
    });
  }, 'botharness: desktop notifications');
  ctx.effect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined' || member) return () => {};
    const clientId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return mountPresenceReporter({
      document,
      window,
      send: presenceSender(clientId),
    });
  }, 'botharness: desktop presence');
  mountClientLive(ctx, {
    actions,
    call,
    setCompanionSource(source) {
      companionSource = source;
      companion.reconnect();
    },
  });
  ctx.effect(() => {
    store.setConfig(loadRosterConfig(storage));
    const controller = new AbortController();
    void actions.load(controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      const outcome = await migrateLegacyRoster({
        storage,
        call,
        remapSortModes: (mapping) => prefs.remapSectionSortModes(mapping),
      });
      if (outcome === 'migrated') await actions.refreshRoster(controller.signal);
      if (controller.signal.aborted) return;
      await actions.ensureChannelPins();
      if (controller.signal.aborted) return;
      await actions.ensureFlatTopOrder();
    });
    return () => {
      controller.abort();
    };
  }, 'botharness: roster load');
  ctx.effect(() => {
    let stopped = false;
    const report = (): void => {
      if (stopped) return;
      void call('developerModeSet', {
        enabled: prefs.source.getSnapshot().developerMode,
      }).catch(() => undefined);
    };
    report();
    const unsubscribe = prefs.source.subscribe(report);
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, 'botharness: developer mode report');

  registerClientSettings(ctx, {
    t,
    prefs,
    actions,
    call,
    botSettings,
    appearance,
    wallpaper,
    zoomSurface: zoom.surface,
    desktopNotifications,
    shortcutBindings,
    companion,
    releaseNotes,
    updateRuns,
  });

  registerClientPanels(ctx, {
    panelId: PANEL_ID,
    t,
    call,
    botSettings,
    profileCards,
    appearance,
    wallpaper,
    nativeChatT,
    nativeSessions,
    releaseNotes,
    telemetryNotice,
    workspace,
    member,
    restoreBotMode,
  });

  const mention: InputTriggerSource = {
    trigger: '@',
    name: 'personabot',
    candidates: async (_session, request) => {
      const bots = await listBots(bridgeHost(call, request.signal), {
        query: request.query,
      }).catch(() => []);
      return bots.map((bot) => ({
        name: bot.slug,
        description: bot.displayName,
      }));
    },
    codec: {
      clipboardText: (ref) => `@${ref}`,
      serialize: async (ref) => sessionBotReference(ref),
    },
    onPick: (pick) => ({
      insert: {
        source: 'personabot',
        ref: pick.candidate.name,
        label: pick.candidate.description ?? pick.candidate.name,
        clipboardText: `@${pick.candidate.name}`,
      },
    }),
  };
  ctx.effect(() => ctx.inputTriggers.registerSource(mention), 'botharness: @ mention');

  const viewToRestore =
    hmrView ?? (lastView?.mode === 'bot' ? { selection: lastView.selection } : undefined);
  const privateLocator =
    typeof window === 'undefined' ? undefined : privateInputLocator(window.location.hash);
  if (privateLocator !== undefined) {
    ctx.effect(
      () =>
        watchPrivateInputNavigation(store, privateLocator, (channelId, messageId) => {
          ctx.layout.selectPanel(PANEL_ID);
          void actions.openChannelAtMessage(channelId, messageId).catch(() => {
            ctx.logger.warn('botharness: private input card locator unavailable');
          });
        }),
      'botharness: private input Chat locator',
    );
  }
  const landing =
    typeof window === 'undefined' || privateLocator !== undefined
      ? undefined
      : fullClientLocator(window.location.hash);
  if (landing !== undefined) {
    ctx.effect(
      () =>
        watchFullClientLanding(store, landing, (target) => {
          if (target.kind === 'new-bot' || target.kind === 'new-channel') {
            ctx.layout.selectPanel(PANEL_ID);
            requestCreation(target.kind === 'new-bot' ? 'bot' : 'channel');
            return;
          }
          ctx.layout.selectPanel(PANEL_ID);
          if (target.kind === 'home') return;
          const opening =
            target.kind === 'dm'
              ? actions.openBot(target.slug)
              : actions.openChannel(target.channelId);
          void opening.catch(() => {
            ctx.logger.warn('botharness: full-client landing conversation unavailable');
          });
        }),
      'botharness: full-client landing',
    );
  }
  if (privateLocator === undefined && landing === undefined && viewToRestore !== undefined) {
    ctx.effect(() => {
      let restored = false;
      const restore = (): void => {
        if (restored || store.getSnapshot().status !== 'ready') return;
        restored = true;
        unsubscribe();
        try {
          if (hmrView !== undefined) ctx.layout.selectPanel(PANEL_ID);
          const info = panelInfoOf(ctx.layout);
          if (info === undefined || info.getSnapshot().activePanelId !== PANEL_ID) return;
          const selection = viewToRestore.selection;
          const snapshot = store.getSnapshot();
          const opening =
            selection?.kind === 'bot' && snapshot.bots.some((bot) => bot.slug === selection.slug)
              ? actions.openBot(selection.slug)
              : selection?.kind === 'channel' &&
                  snapshot.channels.some((channel) => channel.id === selection.channelId)
                ? actions.openChannel(selection.channelId)
                : selection?.kind === 'inbox'
                  ? actions.openActivityCenter()
                  : undefined;
          void opening?.catch((error: unknown) => {
            ctx.logger.warn('botharness: Bot view restore failed', error);
          });
        } catch (error) {
          ctx.logger.warn('botharness: Bot view restore failed', error);
        }
      };
      const unsubscribe = store.subscribe(restore);
      restore();
      return unsubscribe;
    }, 'botharness: Bot view restore');
  }
  ctx.effect(() => {
    const info = panelInfoOf(ctx.layout);
    if (info === undefined) return () => {};
    let enteredBotMode = false;
    let lastWritten: string | undefined;
    const persist = (): void => {
      const active = info.getSnapshot().activePanelId === PANEL_ID;
      if (active) enteredBotMode = true;
      if (!enteredBotMode) return;
      const view = {
        mode: active ? 'bot' : 'dsh',
        selection: store.getSnapshot().selection,
      } as const;
      const serialized = JSON.stringify(view);
      if (serialized === lastWritten) return;
      lastWritten = serialized;
      writeLastView(storage, view);
    };
    const unsubscribePanel = info.subscribe(persist);
    const unsubscribeStore = store.subscribe(() => {
      if (info.getSnapshot().activePanelId === PANEL_ID) persist();
    });
    persist();
    return () => {
      unsubscribePanel();
      unsubscribeStore();
    };
  }, 'botharness: last visible view');
  ctx.effect(
    () => () => {
      if (typeof window === 'undefined') return;
      const info = panelInfoOf(ctx.layout);
      if (info === undefined || info.getSnapshot().activePanelId !== PANEL_ID) return;
      saveHmrView(window as unknown as Record<string, unknown>, store.getSnapshot().selection);
    },
    'botharness: HMR view handoff',
  );
}

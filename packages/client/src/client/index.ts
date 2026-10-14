import { createElement } from 'react';
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

import { BOT_MODE_NAMESPACE, type BotModeSettings } from '../bot-mode-settings.js';
import {
  fullClientLocator,
  privateInputLocator,
} from '../../../core/src/credentials/web-locator.js';
import { watchFullClientLanding, watchPrivateInputNavigation } from './private-input-navigation.js';
import { createNativeHostFiles } from './host-file-actions.js';
import { createFileOpenPreferences } from './file-open-preferences.js';
import { createActions, type BridgeActions } from './actions.js';
import { ProviderAppSetup } from './provider-app-setup.js';
import { BotModePrefs, botModePrefsFace } from './bot-mode-prefs.js';
import {
  createBotSessionVisibility,
  mountBotSessionVisibility,
  type WorkspaceListSnapshot,
} from './bot-session-visibility.js';
import { subscribeBotColorScheme, readBotColorScheme } from './bot-color-scheme.js';
import { botIconMarkup } from './bot-icon.js';
import { installBotNavIcon } from './bot-icon-nav.js';
import {
  BOT_SETTINGS_SECTIONS,
  BotSettings,
  BotSettingsView,
  botSettingsSectionSource,
} from './bot-settings.js';
import { DshBotSettingsItem } from './dsh-bot-settings-item.js';
import { createImApps, ImAppsSection } from './im-apps-section.js';
import {
  AboutSection,
  AdvancedSection,
  CompanionsSection,
  DataPrivacySection,
  DevicesSection,
  GeneralSection,
  MessagingSection,
  ModelsSection,
} from './bot-settings-sections.js';
import { ReleaseNotesController } from './release-notes.js';
import { TelemetryNoticeController } from './telemetry-notice.js';
import './bot-settings-slot.js';
import { BotMain } from './bot-main.js';
import { expectMobileConversation, MobileBotPanel } from './mobile-bot-panel.js';
import { mobileBotViewport, subscribeMobileBotViewport } from './mobile-viewport.js';
import { clearConversationDrafts } from './conversation-draft.js';
import { BotSidebar, createBotPanelEntry } from './bot-sidebar.js';
import { BotModeSidebar } from './bot-mode-sidebar.js';
import {
  botModeSidebarViewport,
  subscribeBotModeSidebarViewport,
} from './bot-mode-sidebar-viewport.js';
import { OnboardingEnterHint, OnboardingLauncher } from './onboarding-checklist-view.js';
import {
  createChannelSidebarBuiltinTabs,
  createChannelSidebarBuiltins,
} from './channel-sidebar-builtins.js';
import { webShortcutBlocked, webModalOpen, webShortcutHelpQuestion } from './channel-shortcuts.js';
import { ShortcutBindings } from './shortcut-bindings.js';
import {
  browserNotificationApi,
  DesktopNotificationPrefs,
  mountDesktopNotifications,
} from './desktop-notifications.js';
import { openHumanAttentionSource } from './human-attention-source.js';
import { ShortcutHelp, ShortcutHelpView } from './shortcut-help.js';
import { mountTabTitle } from './tab-title.js';
import { createChannelSidebarRegistry } from './channel-sidebar.js';
import { createDockPanelRegistry } from './dock-panels.js';
import { createProfileCardBuiltins } from './profile-cards-builtins.js';
import { createGroupProfileCards } from './group-profile.js';
import { createProfileCardRegistry } from './profile-cards.js';
import {
  createBridgeCall,
  loadJournalPage,
  connectionRpc,
  loadActivitySnapshot,
  loadBotSessionIds,
  loadSessionBotOwner,
  loadHumanAttention,
  botExists,
} from './bridge.js';
import {
  SessionOwnerLeading,
  SessionReturnAction,
  SessionReturnMenuItem,
} from './session-return-action.js';
import { mountActivityLive } from './activity-live.js';
import { installChannelFollow, mountChannelLive, mountRosterLive } from './channel-live.js';
import { installTypedLive } from './messaging-defaults-live.js';
import {
  CHANNEL_REMOTE_DESCRIPTOR,
  COMPANION_REMOTE_DESCRIPTOR,
  createChannelFollow,
  createCompanionSource,
  type CompanionNamespace,
  type CompanionSource,
  createTypedLive,
  SNAPSHOT_REMOTE_DESCRIPTORS,
  type ChannelNamespace,
  type SnapshotNamespace,
} from './live-snapshots.js';
import { sessionBotReference } from './mentions.js';
import { en, LOCALE_NS, zh } from './locale.js';
import { registerModeShadow } from './mode.js';
import { browserSystemMotionSource, mountMotionPolicyAttribute } from './motion-preference.js';
import { defaultStorage, loadRosterConfig } from './roster-config.js';
import { mountDevClientRefresh } from './dev-client-refresh.js';
import { saveHmrView, takeHmrView } from './hmr-view.js';
import { consumeLastView, writeLastView } from './last-view.js';
import { migrateLegacyRoster } from './roster-migration.js';
import { CSS } from './styles.js';
import { store } from './store.js';
import { WindowCompanions } from './window-companions.js';
import { WindowCompanionsView } from './window-companions-view.js';

export const name = 'botharness-client';

export const inject = [
  'slots',
  'connection',
  'inputTriggers',
  'layout',
  'locale',
  'sessions',
  'uiWorkspace',
  'workspaces',
  'remote',
  'remote.session',
];

export const PANEL_ID = 'botharness' as MainPanelId;

interface PanelInfoLike {
  getSnapshot(): { activePanelId: string | null };
  subscribe(listener: () => void): () => void;
}

function panelInfoOf(layout: { panelInfo?: PanelInfoLike }): PanelInfoLike | undefined {
  return layout.panelInfo;
}

export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  const style = document.createElement('style');
  style.setAttribute('data-botharness', 'client');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/client.css';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => clearConversationDrafts);
  const storage = defaultStorage();
  const hmrView =
    typeof window === 'undefined'
      ? undefined
      : takeHmrView(window as unknown as Record<string, unknown>);
  const t = ctx.locale.bind(LOCALE_NS);
  const nativeChatT = ctx.locale.bind('chat');
  const call = createBridgeCall(ctx);
  const profileContext = async (): Promise<{ profileId: string }> => {
    const response = await fetch('./api/botharness/companion', { credentials: 'same-origin' });
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
    nativeFiles: createNativeHostFiles(ctx.remote.session),
    fileOpenPreferences: createFileOpenPreferences({ storage, context: profileContext }),
    pickDirectory: () => {
      const picker = ctx.get('uiWorkspace');
      if (picker === undefined) throw new Error('DSH folder picker is unavailable');
      return picker.pickDirectory();
    },
    listDirectory: (path, signal) => {
      const picker = ctx.get('uiWorkspace');
      if (picker === undefined) throw new Error('DSH folder browser is unavailable');
      return picker.listDirectory(path, signal);
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
  const setupRpc = connectionRpc(ctx);
  if (setupRpc) actions.appSetup = new ProviderAppSetup(setupRpc);
  let companionSource: ((url: string) => CompanionSource) | undefined;
  const companion = new WindowCompanions({
    storage,
    exists: (botId) => botExists(call, botId),
    onActivity: (snapshot) => store.applyActivity(snapshot),
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
    void companion.start();
    let mirrored: 'live' | 'stale' | undefined;
    const off = companion.subscribe(() => {
      const value = companion.getSnapshot();
      if (!value.companions.length && mirrored === undefined) return;
      const sync = !value.companions.length || value.sync === 'live' ? 'live' : 'stale';
      if (sync === mirrored) return;
      mirrored = value.companions.length ? sync : undefined;
      store.setActivitySync(sync);
      if (typeof document !== 'undefined') {
        if (sync === 'stale') document.documentElement.dataset['botharnessActivity'] = 'stale';
        else delete document.documentElement.dataset['botharnessActivity'];
      }
    });
    return () => {
      off();
      companion.dispose();
    };
  }, 'botharness: independent Window Companion owner');
  const prefs = new BotModePrefs(storage);
  const botSettings = new BotSettings();
  const shortcutHelp = new ShortcutHelp();
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
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-bot-settings',
        locale: LOCALE_NS,
        inject: () => ({ botSettings, sections: botSettingsSections }),
        children: { 'botharness.settings.section': { kind: 'list', scope: 'root' } },
      },
      BotSettingsView,
    ),
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'botharness-shortcut-help',
        locale: LOCALE_NS,
        inject: () => ({ shortcutHelp, shortcutBindings, ...botModePrefsFace(prefs) }),
      },
      ShortcutHelpView,
    ),
  );
  const releaseNotes = new ReleaseNotesController(call, storage);
  const telemetryNotice = new TelemetryNoticeController(call, storage, () => {
    botSettings.open(BOT_SETTINGS_SECTIONS.dataPrivacy);
  });
  const lastView =
    typeof window === 'undefined'
      ? undefined
      : consumeLastView(window as unknown as Record<string, unknown>, storage);
  let restoreBotMode = hmrView === undefined && lastView?.mode === 'bot';
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
      | undefined) ?? { subscribe: () => () => {}, getSnapshot: () => undefined };
    const visibility = createBotSessionVisibility({
      sessions: nativeSessions,
      workspaces: workspaceList,
      prefs: prefs.source,
      loadBotSessionIds: () => loadBotSessionIds(call),
      warn: (message, error) => ctx.logger.warn(message, error),
    });
    const unmount = mountBotSessionVisibility(visibility);
    return () => {
      unmount();
      visibility.dispose();
    };
  }, 'botharness: Bot Session visibility');
  const dockPanels = createDockPanelRegistry();
  ctx.provide('dockPanels', dockPanels);
  const channelSidebar = createChannelSidebarRegistry(dockPanels);
  ctx.provide('channelSidebar', channelSidebar);
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
  ctx.effect(mountDevClientRefresh, 'botharness: local development refresh');
  ctx.effect(
    () => prefs.attachSystemMotion(browserSystemMotionSource()),
    'botharness: system motion preference',
  );
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return mountMotionPolicyAttribute(prefs.source, document.documentElement);
  }, 'botharness: motion policy boundary');
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness: dictionaries');
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
      if (shortcutHelp.getSnapshot()) {
        event.preventDefault();
        shortcutHelp.close();
        return;
      }
      if (
        trigger === 'question' ? webShortcutBlocked(event.target, document) : webModalOpen(document)
      )
        return;
      event.preventDefault();
      shortcutHelp.open();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, 'botharness: keyboard shortcut list');
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
        let prior = store.getSnapshot().humanInbox;
        const offStore = store.subscribe(() => {
          const next = store.getSnapshot().humanInbox;
          if (next.unreadCount === prior.unreadCount && next.hasAction === prior.hasAction) return;
          prior = next;
          listener();
        });
        const offPrefs = desktopNotifications.subscribe(listener);
        document.addEventListener('visibilitychange', listener);
        window.addEventListener('focus', listener);
        window.addEventListener('blur', listener);
        return () => {
          offStore();
          offPrefs();
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
        return t(`desktopNotify.${kind}`, { bot, channel: item.channelName ?? '' });
      },
      open: (item) => {
        ctx.layout.selectPanel(PANEL_ID);
        void openHumanAttentionSource(actions, item).catch((error: unknown) => {
          ctx.logger.warn('botharness: failed to open notification source', error);
        });
      },
    });
  }, 'botharness: desktop notifications');
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountChannelLive(store, actions)),
    'botharness: Channel live subscription',
  );
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountRosterLive(store, actions)),
    'botharness: Roster live subscription',
  );
  ctx.effect(() => {
    let uninstall: (() => void) | undefined;
    let disposed = false;
    const native = ctx.remote as Partial<Pick<typeof ctx.remote, '$mount' | '$stream'>>;
    if (typeof native.$mount !== 'function' || typeof native.$stream !== 'function')
      return () => {};
    const namespace = (): Partial<SnapshotNamespace> => {
      const mounted = ctx.get('remote.botharness') as Partial<SnapshotNamespace> | undefined;
      if (mounted === undefined) throw new Error('botharness live Remote is not mounted');
      return mounted;
    };
    void ctx.remote
      .$mount({
        package: '@botharness/core',
        descriptors: [
          ...SNAPSHOT_REMOTE_DESCRIPTORS,
          CHANNEL_REMOTE_DESCRIPTOR,
          COMPANION_REMOTE_DESCRIPTOR,
        ],
      })
      .then(
        () => {
          if (disposed) return;
          const uninstallTyped = installTypedLive(
            createTypedLive(ctx.remote, () => {
              const mounted = namespace();
              if (mounted.followRoster === undefined || mounted.followActivity === undefined)
                throw new Error('botharness live Remote is not mounted');
              return mounted as SnapshotNamespace;
            }),
          );
          const uninstallFollow = installChannelFollow(
            createChannelFollow(
              ctx.remote,
              () => {
                const mounted = namespace() as Partial<ChannelNamespace>;
                if (mounted.followChannel === undefined)
                  throw new Error('botharness live Remote is not mounted');
                return mounted as ChannelNamespace;
              },
              (channelId, request, signal) => loadJournalPage(call, channelId, request, signal),
            ),
          );
          companionSource = createCompanionSource(ctx.remote, () => {
            const mounted = namespace() as Partial<CompanionNamespace>;
            if (mounted.followCompanion === undefined)
              throw new Error('botharness live Remote is not mounted');
            return mounted as CompanionNamespace;
          });
          companion.reconnect();
          uninstall = () => {
            companionSource = undefined;
            companion.reconnect();
            uninstallFollow();
            uninstallTyped();
          };
        },
        (error: unknown) => {
          console.warn('botharness: live Remote stream unavailable', error);
        },
      );
    return () => {
      disposed = true;
      uninstall?.();
    };
  }, 'botharness: live streams on the native Remote stream carrier');
  ctx.effect(
    () =>
      mountActivityLive(store, undefined, (signal) => loadActivitySnapshot(call, signal), {
        enabled: () => companion.getSnapshot().companions.length === 0,
        subscribe: companion.subscribe,
      }),
    'botharness: PersonaBot activity subscription',
  );
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

  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<BotModeSettings>(BOT_MODE_NAMESPACE);
    prefs.attach(scope);
    const releaseNavIcon = installBotNavIcon({
      labels: () => [t('settings.nav')],
      markup: () => botIconMarkup(prefs.source.getSnapshot().botIcon, readBotColorScheme()),
      subscribe: (listener) => {
        const offPrefs = prefs.source.subscribe(listener);
        const offScheme = subscribeBotColorScheme(listener);
        return () => {
          offPrefs();
          offScheme();
        };
      },
    });
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.general,
          order: 0,
          label: () => t('botSettings.section.general'),
          locale: LOCALE_NS,
          inject: () => ({
            ...botModePrefsFace(prefs),
            call,
            store,
            onSaved: () => actions.refreshRoster(),
            actions,
            closeBotSettings: () => {
              botSettings.close();
            },
            desktopNotifications,
            shortcutHelp,
          }),
        },
        GeneralSection,
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
          inject: () => ({ ...botModePrefsFace(prefs), actions }),
        },
        ModelsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.messaging,
          order: 20,
          label: () => t('botSettings.section.messaging'),
          locale: LOCALE_NS,
          inject: () => ({ ...botModePrefsFace(prefs), call }),
        },
        MessagingSection,
      ),
    );
    const imApps = createImApps({ call, botSettings, actions });
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.imApps,
          order: 25,
          label: () => t('botSettings.section.imApps'),
          locale: LOCALE_NS,
          inject: () => ({ imApps, store }),
        },
        ImAppsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.companions,
          order: 40,
          label: () => t('botSettings.section.companions'),
          locale: LOCALE_NS,
          inject: () => ({ companion }),
        },
        CompanionsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.devices,
          order: 45,
          label: () => t('botSettings.section.devices'),
          locale: LOCALE_NS,
          inject: () => ({}),
        },
        DevicesSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.dataPrivacy,
          order: 50,
          label: () => t('botSettings.section.dataPrivacy'),
          locale: LOCALE_NS,
          inject: () => ({ call }),
        },
        DataPrivacySection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.advanced,
          order: 60,
          label: () => t('botSettings.section.advanced'),
          locale: LOCALE_NS,
          inject: () => ({ ...botModePrefsFace(prefs), call }),
        },
        AdvancedSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.about,
          order: 70,
          label: () => t('botSettings.section.about'),
          locale: LOCALE_NS,
          inject: () => ({ releaseNotes }),
        },
        AboutSection,
      ),
    );
    settingsCtx.slots.inject('settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'settings.section',
          id: 'botharness',
          order: 25,
          label: () => t('settings.nav'),
          locale: LOCALE_NS,
          inject: () => ({ openBotSettings: () => botSettings.open() }),
        },
        DshBotSettingsItem,
      ),
    );
    return () => {
      releaseNavIcon();
      prefs.detach();
    };
  });

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: () => t('panel.label'),
        locale: LOCALE_NS,
        inject: () => ({
          ...botModePrefsFace(prefs),
          openSettings: () => {
            botSettings.open();
          },
        }),
      },
      createBotPanelEntry(
        () => {
          ctx.layout.selectPanel(null);
        },
        () => {
          ctx.layout.selectPanel(PANEL_ID);
          void actions.openActivityCenter();
        },
        () => actions.refreshHumanInboxStatus(),
        {
          launcher: (translate) =>
            createElement(OnboardingLauncher, { actions, t: translate, placement: 'row' }),
          enterHint: (translate) => createElement(OnboardingEnterHint, { t: translate }),
        },
      ),
    ),
  );

  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: LOCALE_NS,
        inject: () => ({
          actions,
          companion,
          channelSidebar,
          dockPanels,
          profileCards,
          nativeChatT,
          nativeSessions,
          prefs,
          releaseNotes,
          telemetryNotice,
          ...botModePrefsFace(prefs),
          exitBotMode: () => ctx.layout.selectPanel(null),
          openBotSettings: () => botSettings.open(),
        }),
      },
      MobileBotPanel,
    );
    if (restoreBotMode) {
      restoreBotMode = false;
      queueMicrotask(() => {
        const info = panelInfoOf(ctx.layout);
        if (info === undefined || info.getSnapshot().activePanelId !== null) return;
        try {
          ctx.layout.selectPanel(PANEL_ID);
        } catch (error) {
          ctx.logger.warn('botharness: failed to restore Bot mode', error);
        }
      });
    }
    return dispose;
  });

  const resolveSessionOwner = (sessionId: string, signal: AbortSignal) =>
    loadSessionBotOwner(call, sessionId, signal);
  const returnToBot = async (slug: string): Promise<void> => {
    if (!store.getSnapshot().bots.some((bot) => bot.slug === slug)) await actions.load();
    if (!store.getSnapshot().bots.some((bot) => bot.slug === slug))
      throw new Error('PersonaBot is unavailable');
    ctx.layout.selectPanel(PANEL_ID);
    await actions.openBot(slug);
  };
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'botharness-return-to-bot',
        order: 15,
        label: () => t('sessions.return.label'),
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner, returnToBot }),
      },
      SessionReturnAction,
    ),
  );
  ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'botharness-session-owner-avatar',
        order: 20,
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner }),
      },
      SessionOwnerLeading,
    ),
  );
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'botharness-return-to-bot-menu',
        order: 500,
        label: () => t('sessions.return.label'),
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner, returnToBot }),
      },
      SessionReturnMenuItem,
    ),
  );

  registerModeShadow(
    ctx,
    'sidebar',
    () =>
      ctx.slots.register(
        {
          name: 'sidebar',
          priority: -1,
          locale: LOCALE_NS,
          inject: () => ({
            actions,
            companion,
            channelSidebar,
            shortcutBindings,
            ...botModePrefsFace(prefs),
            exitBotMode: () => ctx.layout.selectPanel(null),
            toggleSidebar: () => ctx.layout.toggleSidebar(),
            openBotSettings: () => botSettings.open(),
          }),
        },
        BotModeSidebar,
      ),
    store,
    {
      enabled: botModeSidebarViewport,
      subscribe: subscribeBotModeSidebarViewport,
    },
  );
  registerModeShadow(
    ctx,
    'sidebar.workspaces',
    () =>
      ctx.slots.register(
        {
          name: 'sidebar.workspaces',
          priority: -100,
          locale: LOCALE_NS,
          inject: () => ({
            actions,
            companion,
            channelSidebar,
            shortcutBindings,
            ...botModePrefsFace(prefs),
          }),
        },
        BotSidebar,
      ),
    store,
    {
      enabled: () => !mobileBotViewport(),
      subscribe: subscribeMobileBotViewport,
    },
  );
  registerModeShadow(
    ctx,
    'main',
    () =>
      ctx.slots.register(
        {
          name: 'main',
          key: 'conversation' as MainPanelId,
          priority: -100,
          inject: () => ({
            actions,
            companion,
            channelSidebar,
            dockPanels,
            profileCards,
            nativeChatT,
            nativeSessions,
            prefs,
          }),
        },
        BotMain,
      ),
    store,
  );

  const mention: InputTriggerSource = {
    trigger: '@',
    name: 'personabot',
    candidates: async (_session, request) => {
      const result = await call('list', { query: request.query }, request.signal);
      if (!result.ok) return [];
      const value = result.value as { bots?: readonly { slug?: unknown; displayName?: unknown }[] };
      return (value.bots ?? []).flatMap((bot) =>
        typeof bot.slug === 'string' && bot.slug.length > 0
          ? [
              {
                name: bot.slug,
                ...(typeof bot.displayName === 'string' ? { description: bot.displayName } : {}),
              },
            ]
          : [],
      );
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
          expectMobileConversation();
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
        watchFullClientLanding(store, landing, (slug) => {
          if (slug !== undefined) expectMobileConversation();
          ctx.layout.selectPanel(PANEL_ID);
          if (slug === undefined) return;
          void actions.openBot(slug).catch(() => {
            ctx.logger.warn('botharness: full-client landing Bot unavailable');
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
                  ? selection.view === 'overview'
                    ? actions.openActivityCenter('overview')
                    : actions.openHumanInbox()
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

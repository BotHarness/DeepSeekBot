import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import { createElement } from 'react';
import type { Appearance } from './appearance.js';
import { BotMain } from './bot-main.js';
import { botModePrefsFace } from './bot-mode-prefs.js';
import { BotModeSidebar } from './bot-mode-sidebar.js';
import type { BotSettings } from './bot-settings.js';
import { nativeSettingsNavigation } from './bot-settings-open.js';
import { BotSidebar, createBotPanelEntry } from './bot-sidebar.js';
import { loadSessionBotOwner, type BridgeCall } from './bridge.js';
import { getWindowClass, subscribeWindowClass } from './ds/window-class.js';
import { LOCALE_NS, type BotHarnessTranslate } from './locale.js';
import { MobileBotPanel } from './mobile-bot-panel.js';
import { registerModeShadow, registerShadowEntry } from './mode.js';
import { OnboardingEnterHint, OnboardingLauncher } from './onboarding-checklist-view.js';
import type { createProfileCardRegistry } from './profile-cards.js';
import type { ReleaseNotesController } from './release-notes.js';
import {
  SessionOwnerLeading,
  SessionReturnAction,
  SessionReturnMenuItem,
} from './session-return-action.js';
import { store } from './store.js';
import type { TelemetryNoticeController } from './telemetry-notice.js';
import type { Wallpaper } from './wallpaper.js';

interface PanelInfoLike {
  getSnapshot(): { activePanelId: string | null };
  subscribe(listener: () => void): () => void;
}

export function panelInfoOf(layout: { panelInfo?: PanelInfoLike }): PanelInfoLike | undefined {
  return layout.panelInfo;
}

type MainProps = Parameters<typeof BotMain>[0];
type PanelWorkspace = NonNullable<MainProps['workspace']> &
  Pick<MainProps, 'channelSidebar' | 'dockPanels'>;

export function registerClientPanels(
  ctx: ClientContext,
  {
    panelId,
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
  }: {
    panelId: MainPanelId;
    t: BotHarnessTranslate;
    call: BridgeCall;
    botSettings: BotSettings;
    profileCards: ReturnType<typeof createProfileCardRegistry>;
    appearance: Appearance;
    wallpaper: Wallpaper;
    nativeChatT: MainProps['nativeChatT'];
    nativeSessions: MainProps['nativeSessions'];
    releaseNotes: ReleaseNotesController;
    telemetryNotice: TelemetryNoticeController;
    workspace: PanelWorkspace;
    member: boolean;
    restoreBotMode: boolean;
  },
): void {
  const {
    prefs,
    actions,
    companion,
    channelSidebar,
    dockPanels,
    quickSwitcherSettings,
    shortcutBindings,
  } = workspace;
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: panelId,
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
          ctx.layout.selectPanel(panelId);
          void actions.openActivityCenter();
        },
        () => actions.refreshActivityListStatus(),
        {
          launcher: (translate) =>
            createElement(OnboardingLauncher, {
              actions,
              t: translate,
              placement: 'row',
            }),
          enterHint: (translate) => createElement(OnboardingEnterHint, { t: translate }),
        },
      ),
    ),
  );

  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register(
      {
        name: 'main',
        key: panelId,
        locale: LOCALE_NS,
        inject: () => ({
          call,
          botSettings,
          actions,
          companion,
          channelSidebar,
          dockPanels,
          profileCards,
          appearance,
          wallpaper,
          nativeChatT,
          nativeSessions,
          prefs,
          releaseNotes,
          telemetryNotice,
          workspace,
          ...botModePrefsFace(prefs),
          exitBotMode: member ? undefined : () => ctx.layout.selectPanel(null),
          openBotSettings: (sectionId?: string) => botSettings.open(sectionId),
          quickSwitcherSettings,
          shortcutBindings,
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
          ctx.layout.selectPanel(panelId);
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
    ctx.layout.selectPanel(panelId);
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

  ctx.effect(() => () => nativeSettingsNavigation.close());
  registerModeShadow(
    ctx,
    'sidebar',
    () =>
      registerShadowEntry(ctx, 'sidebar', (priority) =>
        ctx.slots.register(
          {
            name: 'sidebar',
            priority,
            locale: LOCALE_NS,
            inject: () => ({
              actions,
              companion,
              channelSidebar,
              dockPanels,
              shortcutBindings,
              ...botModePrefsFace(prefs),
              exitBotMode: member ? undefined : () => ctx.layout.selectPanel(null),
              toggleSidebar: () => ctx.layout.toggleSidebar(),
              openBotSettings: (sectionId?: string) => botSettings.open(sectionId),
              quickSwitcherSettings,
            }),
          },
          BotModeSidebar,
        ),
      ),
    store,
    {
      enabled: () => getWindowClass() === 'expanded' && !nativeSettingsNavigation.getSnapshot(),
      subscribe: (listener) => {
        const viewport = subscribeWindowClass(listener);
        const navigation = nativeSettingsNavigation.subscribe(listener);
        return () => {
          viewport();
          navigation();
        };
      },
    },
  );
  registerModeShadow(
    ctx,
    'sidebar.workspaces',
    () =>
      registerShadowEntry(ctx, 'sidebar.workspaces', (priority) =>
        ctx.slots.register(
          {
            name: 'sidebar.workspaces',
            priority,
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
      ),
    store,
    {
      enabled: () => getWindowClass() === 'expanded',
      subscribe: subscribeWindowClass,
    },
  );
  registerModeShadow(
    ctx,
    'main',
    () =>
      registerShadowEntry(ctx, 'main', (priority) =>
        ctx.slots.register(
          {
            name: 'main',
            key: 'conversation' as MainPanelId,
            priority,
            inject: () => ({
              actions,
              companion,
              channelSidebar,
              dockPanels,
              profileCards,
              appearance,
              nativeChatT,
              nativeSessions,
              prefs,
              workspace,
            }),
          },
          BotMain,
        ),
      ),
    store,
  );
}

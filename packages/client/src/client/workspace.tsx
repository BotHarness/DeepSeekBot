import { Menu } from './appearance-primitives.js';
import { activityIndicator } from './activity-indicator.js';
import { useActivityIndicatorMenu } from './activity-indicator-menu.js';
import { onboardingFor } from './onboarding.js';
import { HomePanel } from './home-panel.js';
import { WORKSPACE_HOME } from './workspace-context.js';
import { BOT_ONLY_CHANNEL_PANELS } from './dock-panels.js';
import { resolveChannelSidebarContext } from './channel-sidebar.js';
import { usePanelMenu, PanelVisibilityLabel } from './panel-menu.js';
import type { Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client';
import { workspaceShortcutId } from './workspace-shortcuts.js';
import { createPortal } from 'react-dom';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';

import { workspaceColumns, moveWorkspaceRail } from './workspace-layout.js';
import { useState, useSyncExternalStore, type ReactNode, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import type { DockviewApi } from 'dockview-react';
import type { BotModeSidebarProps } from './bot-mode-sidebar.js';
import type { BotModePrefs } from './bot-mode-prefs.js';
import { BotSidebar, useClientState } from './bot-sidebar.js';
import { BotIcon } from './bot-icon.js';
import { ExitIcon } from './exit-icon.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PinnedPanelCards } from './pinned-panel-cards.js';
import { useChannelDockActive, useChannelsHeader } from './channel-dock.js';
import { useMountedResource } from './mounted-resource.js';
import { mountWorkspaceShell, type WorkspaceLayoutCommand } from './workspace-shell.js';
import { CHANNEL_BODY_PANEL, CHANNEL_WORKSPACE_PANELS } from './channel-dock-layout.js';
import { WORKSPACE_CHANNELS, WorkspaceContext } from './workspace-context.js';
import type { BotHarnessTranslate } from './locale.js';

export type WorkspaceOptions = Omit<
  BotModeSidebarProps,
  | 'width'
  | 'collapsed'
  | 'toggleSidebar'
  | 't'
  | 'useBotModePrefs'
  | 'setSortMode'
  | 'setSectionSortMode'
> & {
  layout: WorkspaceLayoutCommand;
  prefs: BotModePrefs;
  shortcuts: Shortcuts;
  registerLayoutSettings(setTarget: (node: HTMLDivElement | null) => void): () => void;
};

export function Workspace({
  options,
  t,
  children,
}: {
  options?: WorkspaceOptions | undefined;
  t: BotHarnessTranslate;
  children: ReactNode;
}): ReactElement {
  const wide = useChannelDockActive();
  const [enabled, setEnabled] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      setEnabled(false);
      if (!wide || !options?.dockPanels) return;
      const registry = options.dockPanels;
      if (
        registry
          .panels()
          .some((panel) => [WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL].includes(panel.id))
      )
        return;
      const release = mountWorkspaceShell(node, options.layout, () =>
        registry.toggle(WORKSPACE_CHANNELS),
      );
      if (!release) return;
      const unregister = registry.register({
        id: WORKSPACE_CHANNELS,
        title: t('workspace.channels'),
        icon: 'hash',
        scope: 'global',
        order: -1,
        defaultPosition: { zone: 'left' },
        component: function Channels() {
          const headerTarget = useChannelsHeader();
          const usePrefs: BotModeSidebarProps['useBotModePrefs'] = (selector) =>
            useSyncExternalStore(options.prefs.source.subscribe, () =>
              selector(options.prefs.source.getSnapshot()),
            );
          return (
            <div className="bh-workspace-channels">
              <BotSidebar
                {...options}
                headerTarget={headerTarget}
                onViewProfile={(slug) => {
                  registry.open(CHANNEL_BODY_PANEL);
                  void options.actions.openBot(slug, 'profile');
                }}
                onOpenConversation={() => registry.open(CHANNEL_BODY_PANEL)}
                wide
                useBotModePrefs={usePrefs}
                setSortMode={(mode) => options.prefs.setSortMode(mode)}
                setSectionSortMode={(id, mode) => options.prefs.setSectionSortMode(id, mode)}
                t={t}
              />
            </div>
          );
        },
      });
      const unregisterMessages = registry.register({
        id: CHANNEL_BODY_PANEL,
        title: t('workspace.messages'),
        icon: 'messages-circle',
        scope: 'global',
        order: 0,
        component: () => null,
      });
      const unregisterHome = registry.register({
        id: WORKSPACE_HOME,
        title: t('workspace.home'),
        icon: 'house',
        scope: 'global',
        order: 1000,
        defaultPosition: { zone: 'center' },
        onTitleHide: () =>
          void onboardingFor(options.actions).finishFromHomeTitle(() =>
            registry.open(CHANNEL_BODY_PANEL),
          ),
        component: function HomeEntry() {
          const sendKey = useSyncExternalStore(
            options.prefs.source.subscribe,
            () => options.prefs.source.getSnapshot().sendKey,
          );
          return (
            <HomePanel
              actions={options.actions}
              registry={registry}
              t={t}
              sendKey={sendKey}
              onEditHumanName={() => options.openBotSettings('messaging')}
            />
          );
        },
      });
      const detachGuide = onboardingFor(options.actions).attachHome(() =>
        registry.open(WORKSPACE_HOME),
      );
      setEnabled(true);
      return () => {
        detachGuide();
        unregisterHome();
        unregisterMessages();
        unregister();
        release();
      };
    },
    [wide, options, t],
  );
  return (
    <div ref={mount} className="bh-workspace-mount" data-workspace-enabled={enabled || undefined}>
      <div className="bh-workspace-chrome" data-window-drag />
      <WorkspaceContext.Provider
        value={
          enabled && options
            ? {
                shortcuts: options.shortcuts,
                rail: (
                  api,
                  gap,
                  setGap,
                  reset,
                  order,
                  setOrder,
                  hiddenControls,
                  setControlVisible,
                ) => (
                  <WorkspaceRail
                    options={options}
                    api={api}
                    gap={gap}
                    setGap={setGap}
                    reset={reset}
                    order={order}
                    setOrder={setOrder}
                    hiddenControls={hiddenControls}
                    setControlVisible={setControlVisible}
                    t={t}
                  />
                ),
              }
            : undefined
        }
      >
        {children}
      </WorkspaceContext.Provider>
    </div>
  );
}

function WorkspaceRail({
  options,
  api,
  gap,
  setGap,
  reset,
  order,
  setOrder,
  hiddenControls,
  setControlVisible,
  t,
}: {
  options: WorkspaceOptions;
  api: DockviewApi;
  gap: number;
  setGap(gap: number): void;
  reset(): void;
  order: readonly string[];
  setOrder(ids: readonly string[]): void;
  hiddenControls: readonly string[];
  setControlVisible(id: string, visible: boolean): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const icon = useSyncExternalStore(
    options.prefs.source.subscribe,
    () => options.prefs.source.getSnapshot().botIcon,
  );
  const state = useClientState();
  const indicatorMenu = useActivityIndicatorMenu(t);
  const indicator = activityIndicator(indicatorMenu.scope, state.humanInbox);
  const attentionLabel = [
    ...(state.humanInbox.unreadCount > 0
      ? [t('humanInbox.unreadCount', { count: String(state.humanInbox.unreadCount) })]
      : []),
    ...(state.humanInbox.hasAction ? [t('humanInbox.action')] : []),
    ...(indicator === 'unknown' ? [t('activityIndicator.unavailable')] : []),
  ].join(' · ');
  const shortcuts = useSyncExternalStore(
    options.shortcuts.catalog.subscribe,
    options.shortcuts.catalog.getSnapshot,
  );
  const panels = useSyncExternalStore(options.dockPanels!.subscribe, options.dockPanels!.panels);
  const botOnlyHidden = resolveChannelSidebarContext(state)?.botSlug
    ? []
    : [
        ...BOT_ONLY_CHANNEL_PANELS,
        ...panels.filter((p) => p.binding === 'current-bot').map((p) => p.id),
      ];
  const controlMenu = usePanelMenu({
    items: [
      { type: 'label', id: 'controls', text: t('workspace.visibleControls') },
      ...panels
        .filter(
          (panel) =>
            panel.id !== 'members' &&
            panel.id !== 'bot-inbox' &&
            !CHANNEL_WORKSPACE_PANELS.includes(panel.id) &&
            panel.binding !== 'current-bot' &&
            !botOnlyHidden.includes(panel.id),
        )
        .map((panel) => ({
          id: panel.id,
          icon: <ChannelSidebarIcon name={panel.icon} />,
          label: (
            <PanelVisibilityLabel
              label={panel.title}
              checked={!hiddenControls.includes(panel.id)}
              t={t}
            />
          ),
        })),
    ],
    keepOpen: true,
    onSelect: (id) => setControlVisible(id, hiddenControls.includes(id)),
  });
  const [menu, setMenu] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<HTMLDivElement | null>(null);
  const settingsMount = useMountedResource<HTMLSpanElement>(
    () => options.registerLayoutSettings(setSettingsTarget),
    [options],
  );
  const move = (target: string) => {
    moveWorkspaceRail(api, target);
  };
  return (
    <nav
      className="bh-workspace-rail"
      aria-label={t('workspace.controls')}
      {...controlMenu.triggerProps}
    >
      {controlMenu.menu}
      <Tooltip label={t('panel.exit')} side="right">
        <button
          className="bh-workspace-exit"
          aria-label={t('panel.exit')}
          onClick={options.exitBotMode}
        >
          <span className="bh-workspace-brand">
            <BotIcon icon={icon} size={24} />
          </span>
          <span className="bh-workspace-exit-icon">
            <ExitIcon size={20} />
          </span>
        </button>
      </Tooltip>
      <div className="bh-workspace-controls" data-window-drag>
        <div data-window-drag-recall>
          {options.dockPanels && (
            <PinnedPanelCards
              registry={options.dockPanels}
              order={order}
              onOrderChange={setOrder}
              hiddenIds={[
                'members',
                'bot-inbox',
                ...CHANNEL_WORKSPACE_PANELS,
                ...panels.filter((p) => p.binding === 'current-bot').map((p) => p.id),
                ...botOnlyHidden,
                ...hiddenControls,
              ]}
              shortcut={(id) => shortcuts.find((row) => row.id === workspaceShortcutId(id))?.keys}
              collapsed
              t={t}
              menuTrigger={(id) =>
                id === 'activity-center' ? indicatorMenu.triggerProps : undefined
              }
              badge={(id) =>
                id === 'activity-center'
                  ? {
                      count: state.humanInbox.unreadCount,
                      dot: state.humanInbox.hasAction,
                      indicator,
                      label: attentionLabel || undefined,
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      {indicatorMenu.menu}
      <span className="bh-workspace-grip">
        <Menu
          open={menu}
          portal
          anchor={
            <button
              className="bh-workspace-move"
              aria-label={t('workspace.move')}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-bh-rail', 'move');
                event.dataTransfer.effectAllowed = 'move';
              }}
            >
              <ChannelSidebarIcon name="grip-vertical" />
            </button>
          }
          items={[
            { id: 'left', label: t('workspace.left') },
            ...workspaceColumns(api)
              .slice(1)
              .map((column, index) => ({
                id: column.id,
                label: t('workspace.beforeColumn', { index: String(index + 2) }),
              })),
            { id: 'right', label: t('workspace.right') },
          ]}
          onSelect={(id) => {
            setMenu(false);
            move(id);
          }}
          onClose={() => setMenu(false)}
        />
      </span>
      <span ref={settingsMount} hidden />
      {settingsTarget &&
        createPortal(
          <SettingsSection title={t('workspace.appearance')}>
            <SettingsRow
              title={t('workspace.gap')}
              control={
                <>
                  <output>{gap}px</output>
                  <input
                    aria-label={t('workspace.gap')}
                    type="range"
                    min={0}
                    max={16}
                    step={1}
                    value={gap}
                    onChange={(event) => setGap(Number(event.target.value))}
                  />
                </>
              }
            />
            <SettingsRow
              title={t('dock.reset')}
              control={<Button onClick={reset}>{t('dock.reset')}</Button>}
            />
          </SettingsSection>,
          settingsTarget,
        )}

      <Tooltip label={t('panel.settings')} side="right">
        <button aria-label={t('panel.settings')} onClick={() => options.openBotSettings()}>
          <ChannelSidebarIcon name="settings" />
        </button>
      </Tooltip>
      <Tooltip label={t('panel.backToHarness')} side="right">
        <button type="button" aria-label={t('panel.backToHarness')} onClick={options.exitBotMode}>
          <ExitIcon size={20} />
        </button>
      </Tooltip>
    </nav>
  );
}

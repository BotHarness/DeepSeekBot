import { Icon } from './ds/icon.js';
import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import { Tooltip } from './ds/tooltip.js';
import { DeviceRequestsNotice } from './device-requests-notice.js';

import type { BotModeSortMode } from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { BotSidebar } from './bot-sidebar.js';
import { useClientStore } from './use-client-store.js';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import type { ClientState } from './store.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import { ACTIVITY_CENTER_PANEL, type DockPanelRegistry } from './dock-panels.js';
import { hooked } from './ds/hooked.js';
import { IconButton } from './ds/icon-button.js';
import { NavItem } from './ds/nav-item.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { size } from './ds/tobs.stylex.js';
import { ExitIcon } from './exit-icon.js';
import { InboxIcon } from './inbox-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import { observeHumanAttention } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';
import { OnboardingLauncher } from './onboarding-checklist-view.js';
import { PinnedPanelCards } from './pinned-panel-cards.js';
import type { QuickSwitcherSettings } from './quick-switcher.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { unreadCountLabel } from './unread-count.js';
import type { WindowCompanions } from './window-companions.js';

export interface BotModeSidebarProps {
  collapsed: boolean;
  width: number;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar?: ChannelSidebarRegistry | undefined;
  dockPanels?: DockPanelRegistry | undefined;
  shortcutBindings?: ShortcutBindings | undefined;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  exitBotMode?: (() => void) | undefined;
  toggleSidebar: () => void;
  closeDrawer?: (() => void) | undefined;
  openBotSettings: (sectionId?: string) => void;
  quickSwitcherSettings?: QuickSwitcherSettings | undefined;
  t: BotHarnessTranslate;
}

const selectSidebarNavigation = (state: ClientState) => ({
  unreadCount: state.activityList.unreadCount,
  hasAction: state.activityList.hasAction,
  messageCounts: state.activityList.messageCounts,
  attentionStatus: state.activityList.attentionStatus,
  inboxCurrent: state.selection?.kind === 'inbox',
});

export function BotModeSidebar(props: BotModeSidebarProps): ReactElement {
  const { collapsed, actions, closeDrawer, useBotModePrefs, t } = props;
  const wide = !collapsed;
  const icon = useBotModePrefs((prefs) => prefs.botIcon);
  const navigation = useClientStore(selectSidebarNavigation, shallowEqual);
  const scope = useRemoteHosts();
  const attention = environmentAttention(navigation, scope);
  const unread = attention.unreadCount;
  const inboxNotes = [
    ...(unread > 0 ? [t('activityList.unreadCount', { count: unreadCountLabel(unread) })] : []),
    ...(attention.hasAction ? [t('activityList.action')] : []),
  ];
  const inboxLabel = [t('activityCenter.title'), ...inboxNotes].join(' · ');
  const inboxCurrent = navigation.inboxCurrent;
  const toggleLabel = t(
    closeDrawer
      ? 'panel.sidebar.close'
      : collapsed
        ? 'panel.sidebar.open'
        : 'panel.sidebar.collapse',
  );
  const darwin =
    closeDrawer === undefined && document.documentElement.dataset.platform === 'darwin';
  const exitLabel = t('panel.exit');
  const [logoHover, setLogoHover] = useState(false);
  const [logoFocus, setLogoFocus] = useState(false);
  const morph = logoHover || logoFocus;
  const rootMount = useMountedResource<HTMLDivElement>(() => {
    void actions.refreshActivityListStatus();
    return observeHumanAttention(() => void actions.refreshActivityListStatus());
  }, [actions]);

  const row = (
    label: string,
    glyph: ReactNode,
    onClick: () => void,
    extra: {
      tour?: string;
      current?: boolean;
      trailing?: ReactNode;
      dot?: boolean;
    } = {},
  ): ReactElement => (
    <Tooltip label={label} side="right" delayMs={500} disabled={wide}>
      <NavItem
        className="bh-mode-sidebar-row"
        label={label.split(' · ')[0]}
        aria-label={label}
        current={extra.current === true}
        iconOnly={collapsed}
        xstyle={collapsed ? styles.railItem : undefined}
        trailing={wide ? extra.trailing : undefined}
        icon={
          <span {...stylex.props(styles.glyph)}>
            {glyph}
            {collapsed && extra.dot === true ? (
              <span data-sidebar-attention="" {...stylex.props(styles.dot)} />
            ) : null}
          </span>
        }
        data={{ 'data-bh-tour': extra.tour }}
        onSelect={onClick}
      />
    </Tooltip>
  );

  return (
    <div
      ref={rootMount}
      {...hooked(
        'bh-root bh-mode-sidebar',
        styles.root,
        collapsed && styles.rootCollapsed,
        closeDrawer !== undefined && styles.rootDrawer,
      )}
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={t('panel.label')}
      role="navigation"
    >
      {darwin && wide ? <div {...stylex.props(styles.darwinStrip)} data-window-drag /> : null}
      <div {...stylex.props(styles.logoRow, collapsed && styles.logoRowCollapsed)} data-window-drag>
        {props.exitBotMode === undefined || closeDrawer !== undefined ? (
          <span {...hooked('bh-mode-sidebar-logo', styles.logo, collapsed && styles.logoCollapsed)}>
            <span {...stylex.props(styles.morph)}>
              <BotIcon icon={icon} size={24} />
            </span>
          </span>
        ) : (
          <Tooltip label={exitLabel} side={wide ? 'bottom' : 'right'} delayMs={300}>
            <button
              type="button"
              {...hooked('bh-mode-sidebar-logo', styles.logo, collapsed && styles.logoCollapsed)}
              data-bh-tour="bot-mode"
              data-exit={morph ? 'true' : undefined}
              aria-label={exitLabel}
              onClick={props.exitBotMode}
              onPointerEnter={() => setLogoHover(true)}
              onPointerLeave={() => setLogoHover(false)}
              onFocus={(event) => setLogoFocus(event.currentTarget.matches(':focus-visible'))}
              onBlur={() => setLogoFocus(false)}
            >
              <span {...stylex.props(styles.morph, morph && styles.morphHidden)}>
                <BotIcon icon={icon} size={24} />
              </span>
              <span
                {...stylex.props(styles.morph, styles.morphExit, !morph && styles.morphHidden)}
                aria-hidden
              >
                <ExitIcon size={18} />
              </span>
            </button>
          </Tooltip>
        )}
        {wide ? <span {...stylex.props(styles.brandName)}>{t('panel.brand')}</span> : null}
        <Tooltip
          label={toggleLabel}
          side="right"
          delayMs={500}
          disabled={closeDrawer !== undefined}
        >
          <IconButton
            xstyle={
              closeDrawer ? styles.drawerAction : collapsed ? styles.iconButtonCollapsed : undefined
            }
            aria-label={toggleLabel}
            onClick={props.toggleSidebar}
            data-modal-autofocus={closeDrawer === undefined ? undefined : ''}
          >
            <Icon name={closeDrawer ? 'x' : 'panel-left'} size={wide ? 16 : 18} />
          </IconButton>
        </Tooltip>
      </div>
      {props.dockPanels === undefined ? (
        <div {...stylex.props(styles.list, collapsed && styles.listCollapsed)}>
          {row(
            inboxLabel,
            <InboxIcon size={wide ? 16 : 18} />,
            () => {
              closeDrawer?.();
              void actions.openActivityCenter();
            },
            {
              tour: 'inbox',
              current: inboxCurrent,
              dot: unread > 0 || attention.hasAction,
              trailing:
                unread > 0 ? (
                  <span {...stylex.props(styles.count)}>{unreadCountLabel(unread)}</span>
                ) : null,
            },
          )}
        </div>
      ) : (
        <PinnedPanelCards
          registry={props.dockPanels}
          collapsed={collapsed}
          current={inboxCurrent ? ACTIVITY_CENTER_PANEL : undefined}
          badge={(id) =>
            id === ACTIVITY_CENTER_PANEL
              ? {
                  count: unread,
                  dot: attention.hasAction,
                  label: inboxNotes.length === 0 ? undefined : inboxNotes.join(' · '),
                }
              : undefined
          }
          fallback={(id) =>
            id === ACTIVITY_CENTER_PANEL ? () => void actions.openActivityCenter() : undefined
          }
          tourOf={(id) => (id === ACTIVITY_CENTER_PANEL ? 'inbox' : undefined)}
          t={t}
        />
      )}
      <div {...stylex.props(styles.region, collapsed && styles.regionCollapsed)}>
        <BotSidebar
          wide={wide}
          headerEnd={<OnboardingLauncher actions={actions} t={t} placement="header" />}
          actions={actions}
          companion={props.companion}
          useBotModePrefs={useBotModePrefs}
          channelSidebar={props.channelSidebar}
          shortcutBindings={props.shortcutBindings}
          quickSwitcherSettings={props.quickSwitcherSettings}
          setSortMode={props.setSortMode}
          setSectionSortMode={props.setSectionSortMode}
          onOpenConversation={closeDrawer}
          onViewProfile={
            closeDrawer &&
            ((slug) => {
              closeDrawer();
              void actions.openBot(slug, 'profile');
            })
          }
          dockPanels={props.dockPanels}
          t={t}
        />
      </div>
      <div {...stylex.props(styles.list, styles.foot, collapsed && styles.listCollapsed)}>
        <DeviceRequestsNotice
          t={t}
          trigger={(open) =>
            row(t('connections.pending'), <InboxIcon size={wide ? 16 : 18} />, open, { dot: true })
          }
        />
        {row(
          t('panel.settings'),
          <Icon name="settings" size={wide ? 16 : 18} />,
          () => {
            closeDrawer?.();
            props.openBotSettings();
          },
          { tour: 'bot-settings' },
        )}
        {closeDrawer !== undefined && props.exitBotMode !== undefined && (
          <NavItem
            label={t('panel.exit')}
            icon={<ExitIcon size={16} />}
            onSelect={props.exitBotMode}
            data={{ 'data-bh-tour': 'bot-mode' }}
          />
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    '--dsh-sidebar-inline-padding': space.x4,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    color: color.fg,
    fontSize: text.titleSize,
  },
  rootCollapsed: {
    alignItems: 'center',
    paddingTop: space.x5,
    paddingInline: space.x3,
  },
  rootDrawer: { paddingTop: `max(${space.x2}, env(safe-area-inset-top))` },
  darwinStrip: {
    flexShrink: 0,
    height: '40px',
  },
  logoRow: {
    boxSizing: 'border-box',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: space.x2,
    height: '60px',
    marginBottom: space.x2,
    paddingBlock: space.x3,
    paddingInlineStart: space.x1,
    overflow: 'hidden',
  },
  logoRowCollapsed: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: space.x4,
    height: 'auto',
    marginBottom: space.x4,
    padding: 0,
    overflow: 'visible',
  },
  logo: {
    position: 'relative',
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: '-2px',
    borderRadius: radius.md,
    color: color.fg,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
    },
    cursor: 'pointer',
  },
  logoCollapsed: {
    width: '36px',
    height: '36px',
  },
  morph: {
    position: 'absolute',
    inset: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
    transform: 'scale(1) rotate(0deg)',
    transitionDuration: '160ms',
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: 'ease-out',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0s',
    },
  },
  morphExit: {
    color: color.danger,
  },
  morphHidden: {
    opacity: 0,
    transform: 'scale(0.6) rotate(-90deg)',
  },
  brandName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    fontSize: text.titleSize,
    fontWeight: text.strong,
    lineHeight: text.titleLine,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  iconButtonCollapsed: {
    width: size.rowMedium,
    height: size.rowMedium,
    borderRadius: radius.md,
    color: color.fg,
  },
  drawerAction: { width: size.rowLarge, height: size.rowLarge },
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    gap: space.x2,
    marginBottom: space.x3,
  },
  listCollapsed: {
    alignItems: 'center',
    gap: space.x4,
    marginBottom: space.x4,
  },
  foot: {
    marginTop: space.x2,
    marginBottom: 0,
  },
  railItem: { width: size.rowMedium, minHeight: size.rowMedium },
  glyph: {
    position: 'relative',
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: `calc(-1 * ${space.x1})`,
    right: `calc(-1 * ${space.x1})`,
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },

  count: {
    flexShrink: 0,
    minWidth: '18px',
    paddingInline: space.x2,
    borderRadius: radius.lg,
    color: color.onDanger,
    backgroundColor: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
  },
  region: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    marginInlineStart: `calc(-1 * ${space.x2})`,
    marginInlineEnd: `calc(-1 * ${space.x4})`,
    paddingInlineStart: space.x2,
    overflow: 'hidden',
  },
  regionCollapsed: {
    alignSelf: 'stretch',
    margin: 0,
    padding: 0,
  },
});
import { useRemoteHosts } from './host-tabs.js';
import { environmentAttention } from './environment-activity.js';

import { Icon } from './ds/icon.js';
import { MEMBER_MENU_ITEMS, menuItemAllowed } from './team-menu.js';
import { Menu } from './appearance-primitives.js';
import { ALL_HOSTS, type RemoteHostsSnapshot } from './remote-hosts.js';
import { EnvironmentFilter } from './environment-panel.js';
import { plainMarkdown } from '../../../core/src/channels/message-preview.js';
import { PointerMenu } from './ds/pointer-menu.js';
import {
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  type RefCallback,
  type MutableRefObject,
} from 'react';
import type { MenuEntry } from './ds/menu.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  CHANNEL_NICKNAME_ITEM,
  CHANNEL_SETTINGS_ITEM,
  channelNicknameItem,
  channelSettingsItem,
  dmActionKindOf,
  dmActionsItem,
  dmMemoryDisplayOf,
} from './channel-options.js';
import type { DmActionKind, DmMemoryDisplay } from './dm-actions.js';
import { gitReady } from './git-unavailable-notice.js';
import type { RosterSection } from './roster.js';
import {
  channelMoveMenuItems,
  globalSortMenuItems,
  NEW_SECTION_MOVE_TARGET,
  UNGROUPED_MOVE_TARGET,
} from './section-management.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import type { TeamModeView } from './team-bridge.js';
import type { SidebarState, SidebarProps, ChannelMenuRequest } from './bot-sidebar-types.js';
import { useBotSidebar } from './bot-sidebar-view.js';

function useSidebarSearchInput({
  state,
  searchOpen,
  setSearchOpen,
}: {
  state: SidebarState;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchQueryRef = useRef(state.query);
  searchQueryRef.current = state.query;
  const searchMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (!searchOpen) return;
      node.querySelector<HTMLInputElement>('.bh-search-input')?.focus({ preventScroll: true });
      const onClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Node) || node.contains(event.target)) return;
        searchInput.current?.blur();
        if (searchQueryRef.current.trim() !== '') return;
        setSearchOpen(false);
      };
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
    },
    [searchOpen],
  );
  return { searchInput, searchMount };
}

function renderSidebarHeader({
  headerTarget,
  searchOpen,
  t,
  hostTabs,
  searchOpenMark,
  searchMount,
  setMenuOpen,
  setSortMenuOpen,
  setSearchOpen,
  searchInput,
  state,
  sortMenuOpen,
  channelUnread,
  prefs,
  selectSortMenu,
  menuOpen,
  remoteHostsState,
  teamMode,
  member,
  selectMenu,
  headerEnd,
}: {
  headerTarget: HTMLElement | null | undefined;
  searchOpen: boolean;
  t: BotHarnessTranslate;
  hostTabs: boolean;
  searchOpenMark: (node: HTMLElement | null) => void;
  searchMount: RefCallback<HTMLDivElement>;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSortMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  searchInput: MutableRefObject<HTMLInputElement | null>;
  state: SidebarState;
  sortMenuOpen: boolean;
  channelUnread: Readonly<Record<string, number>>;
  prefs: BotModePrefsSnapshot;
  selectSortMenu: (id: string) => void;
  menuOpen: boolean;
  remoteHostsState: RemoteHostsSnapshot;
  teamMode: TeamModeView | undefined;
  member: boolean;
  selectMenu: (id: string) => void;
  headerEnd: ReactNode;
}): ReactElement {
  return (
    <div key="roster-header" className="bh-header">
      {!headerTarget && (
        <span className={`bh-header-label${searchOpen ? ' bh-header-label-hidden' : ''}`}>
          {t('roster.messages')}
        </span>
      )}
      {hostTabs && !searchOpen ? <EnvironmentFilter t={t} /> : null}
      <div
        ref={searchOpenMark}
        className={`bh-search-slot${searchOpen ? ' bh-search-slot-open' : ''}`}
      >
        <div
          ref={searchMount}
          className={`bh-search${searchOpen ? ' bh-search-open' : ''}`}
          onClick={() => {
            setMenuOpen(false);
            setSortMenuOpen(false);
            setSearchOpen(true);
            searchInput.current?.focus();
          }}
        >
          <Tooltip
            label={t('roster.search.label')}
            side="bottom"
            delayMs={500}
            disabled={searchOpen}
          >
            <button
              type="button"
              className="bh-search-btn"
              aria-label={t('roster.search.label')}
              aria-expanded={searchOpen}
              onClick={() => {
                setMenuOpen(false);
                setSortMenuOpen(false);
                setSearchOpen(true);
              }}
            >
              <Icon name="search" size={searchOpen ? 11 : 14} />
            </button>
          </Tooltip>
          <input
            ref={searchInput}
            className="bh-search-input"
            type="text"
            placeholder={t('roster.search.placeholder')}
            value={state.query}
            tabIndex={searchOpen ? 0 : -1}
            onChange={(event) => store.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              store.setQuery('');
              setSearchOpen(false);
            }}
          />
          {searchOpen ? (
            <button
              type="button"
              className="bh-clear-btn"
              aria-label={t('roster.search.clear')}
              onClick={(event) => {
                event.stopPropagation();
                store.setQuery('');
                setSearchOpen(false);
              }}
            >
              <Icon name="circle-x" />
            </button>
          ) : null}
        </div>
      </div>
      <div className={`bh-header-actions${searchOpen ? ' bh-header-actions-hidden' : ''}`}>
        <Menu
          open={sortMenuOpen}
          portal
          dense
          align="end"
          anchor={
            <Tooltip label={t('roster.menu.label')} side="bottom" delayMs={500}>
              <button
                type="button"
                className="bh-icon-btn"
                aria-label={t('roster.menu.label')}
                onClick={() => {
                  setSortMenuOpen((value) => !value);
                }}
              >
                <Icon name="ellipsis" size={16} />
              </button>
            </Tooltip>
          }
          items={globalSortMenuItems(t, {
            hasUnread: Object.keys(channelUnread).length > 0,
          })}
          selectedId={prefs.sortMode}
          onSelect={selectSortMenu}
          onClose={() => {
            setSortMenuOpen(false);
          }}
        />
        <Menu
          open={menuOpen}
          portal
          dense
          align="end"
          anchor={
            <Tooltip label={t('roster.new.label')} side="bottom" delayMs={500}>
              <button
                type="button"
                className="bh-icon-btn"
                aria-label={t('roster.new.label')}
                onClick={() => {
                  setMenuOpen((value) => !value);
                }}
              >
                <Icon name="plus" size={16} />
              </button>
            </Tooltip>
          }
          items={menuItems(
            t,
            hostTabs && remoteHostsState.tab !== 'local' ? true : gitReady(state.git),
            !hostTabs || remoteHostsState.tab === 'local',
            teamMode?.enabled === true &&
              !(
                hostTabs &&
                remoteHostsState.hosts.some((remote) => remote.host.hostId === remoteHostsState.tab)
              ),
            member,
            teamMode?.enabled === true || (hostTabs && !member),
          ).filter(
            (item) =>
              (!member || MEMBER_MENU_ITEMS.has(item.id)) &&
              menuItemAllowed(item.id, teamMode?.enabled === true ? teamMode.viewer : undefined) &&
              (item.id !== 'section' ||
                member ||
                !hostTabs ||
                remoteHostsState.tab !== ALL_HOSTS) &&
              (item.id !== 'message-person' ||
                (hostTabs && remoteHostsState.tab !== 'local' && !member) ||
                teamMode?.viewer.owner === true ||
                teamMode?.viewer.permissions.includes('dm.humans') === true),
          )}
          onSelect={selectMenu}
          onClose={() => {
            setMenuOpen(false);
          }}
        />
      </div>
      {headerEnd}
    </div>
  );
}

function renderSidebarIcon(props: ComponentProps<typeof ChannelSidebarIcon>): ReactElement {
  return <ChannelSidebarIcon {...props} />;
}

export function BulkChannelMenu({
  sectionManagement = true,
  menu,
  sections,
  allPinned = false,
  itemsLabel,
  t,
  onCreateSection,
  onPin,
  onHide,
  onPick,
  onClose,
}: {
  sectionManagement?: boolean;
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  allPinned?: boolean;
  itemsLabel: string;
  t: BotHarnessTranslate;
  onCreateSection: () => void;
  onPin: (pinned: boolean) => void;
  onHide: () => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const items: readonly MenuEntry[] = [
    {
      id: allPinned ? 'unpin' : 'pin',
      label: t(allPinned ? 'bulk.unpin' : 'bulk.pin', { items: itemsLabel }),
      icon: allPinned ? <Icon name="pin" filled size={16} /> : <Icon name="pin" size={16} />,
    },
    { type: 'separator', id: 'bulk-pin-separator' },
    {
      id: 'move',
      label: t('bulk.move', { items: itemsLabel }),
      icon: <Icon name="folder-open" size={16} />,
      submenu: [
        { id: NEW_SECTION_MOVE_TARGET, label: t('move.newSection') },
        ...sections.map((section) => ({ id: section.id, label: section.name })),
        { id: UNGROUPED_MOVE_TARGET, label: t('roster.ungrouped') },
      ],
    },
    { type: 'separator', id: 'bulk-action-separator' },
    {
      id: 'hide',
      label: t('bulk.hide', { items: itemsLabel }),
      icon: <ChannelSidebarIcon name="eye-off" size={16} />,
    },
  ];
  return (
    <span ref={menuMount} hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={sectionManagement ? items : items.filter((item) => item.id !== 'move')}
        onSelect={(id) => {
          if (id === 'pin' || id === 'unpin') onPin(id === 'pin');
          else if (id === 'hide') onHide();
          else if (id === NEW_SECTION_MOVE_TARGET) onCreateSection();
          else onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

export function ChannelMoveMenu({
  sectionManagement = true,
  readAction,
  muteAction,
  companionAction,
  shareAction,
  marketAction,
  deleteAction,
  settingsAction,
  profileAction,
  avatarAction,
  nicknameAction,
  dmActions,
  modelAction,
  menu,
  sections,
  currentSectionId,
  pinned = false,
  t,
  onSetPinned,
  onHide,
  onRename,
  onCreateSection,
  onPick,
  onClose,
}: {
  sectionManagement?: boolean;
  readAction?: { label: string; run(): void } | undefined;
  muteAction?: { label: string; muted: boolean; run(): void } | undefined;
  companionAction?: { label: string; run(): void } | undefined;
  shareAction?: { label: string; run(): void } | undefined;
  marketAction?: (() => void) | undefined;
  deleteAction?: { label: string; run(): void } | undefined;
  settingsAction?: { attention: boolean; run(): void } | undefined;
  profileAction?: (() => void) | undefined;
  avatarAction?: (() => void) | undefined;
  nicknameAction?: (() => void) | undefined;
  dmActions?:
    | {
        hidden: readonly DmActionKind[];
        toggle(kind: DmActionKind): void;
        memoryDisplay: DmMemoryDisplay;
        setMemoryDisplay(value: DmMemoryDisplay): void;
      }
    | undefined;
  modelAction?: (() => void) | undefined;
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  currentSectionId: string | undefined;
  pinned?: boolean;
  t: BotHarnessTranslate;
  onSetPinned?: (channelId: string, pinned: boolean) => void;
  onHide?: (channelId: string) => void;
  onRename?: (channelId: string) => void;
  onCreateSection?: (channelId: string) => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  const items: readonly MenuEntry[] = [
    ...(profileAction
      ? [
          {
            id: 'profile',
            label: t('profile.view'),
            icon: <ChannelSidebarIcon name="id-card" size={16} />,
          },
        ]
      : []),
    ...(avatarAction
      ? [
          {
            id: 'change-avatar',
            label: t('roster.menu.changeAvatar'),
            icon: <ChannelSidebarIcon name="image-up" size={16} />,
          },
        ]
      : []),
    ...(settingsAction === undefined
      ? []
      : [
          channelSettingsItem(t, settingsAction.attention),
          { type: 'separator' as const, id: 'settings-separator' },
        ]),
    ...(companionAction === undefined
      ? []
      : [
          {
            id: 'companion',
            label: companionAction.label,
            icon: <ChannelSidebarIcon name="monitor" size={16} />,
          },
        ]),
    ...(shareAction === undefined
      ? []
      : [
          {
            id: 'share',
            label: shareAction.label,
            icon: <Icon name="share" size={16} />,
          },
        ]),
    ...(marketAction === undefined
      ? []
      : [
          {
            id: 'share-market',
            label: t('market.share'),
            icon: <ChannelSidebarIcon name="store" size={16} />,
          },
        ]),
    {
      id: pinned ? 'unpin' : 'pin',
      label: t(pinned ? 'pin.remove' : 'pin.add'),
      icon: pinned ? <Icon name="pin" filled size={16} /> : <Icon name="pin" size={16} />,
    },
    ...(readAction === undefined
      ? []
      : [
          {
            id: 'mark-read',
            label: readAction.label,
            icon: <Icon name="check" size={16} />,
          },
        ]),
    ...(muteAction === undefined
      ? []
      : [
          {
            id: muteAction.muted ? 'unmute' : 'mute',
            label: muteAction.label,
            icon: <ChannelSidebarIcon name={muteAction.muted ? 'bell' : 'bell-off'} size={16} />,
          },
        ]),
    { type: 'separator', id: 'pin-separator' },
    ...(modelAction === undefined
      ? []
      : [
          {
            id: 'bot-model',
            label: t('roster.menu.model'),
            icon: <Icon name="bot" size={16} />,
          },
        ]),
    ...(sectionManagement ? channelMoveMenuItems(t, sections, currentSectionId) : []).map(
      (entry) =>
        'type' in entry ? entry : { ...entry, icon: <Icon name="folder-open" size={16} /> },
    ),
    { type: 'separator', id: 'channel-action-separator' },
    {
      id: 'rename',
      label: t('channel.rename'),
      icon: <Icon name="pencil" size={16} />,
    },
    ...(nicknameAction === undefined ? [] : [channelNicknameItem(t)]),
    ...(dmActions === undefined
      ? []
      : [dmActionsItem(t, dmActions.hidden, dmActions.memoryDisplay)]),
    { type: 'separator', id: 'hide-separator' },
    {
      id: 'hide',
      label: t('hidden.action'),
      icon: <ChannelSidebarIcon name="eye-off" size={16} />,
    },
    ...(deleteAction === undefined
      ? []
      : [
          {
            id: 'delete',
            label: deleteAction.label,
            icon: <Icon name="trash" size={16} />,
            danger: true,
          },
        ]),
  ];
  return (
    <span ref={menuMount} hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={items}
        onSelect={(id) => {
          if (id === 'profile') {
            profileAction?.();
            return;
          }
          if (id === 'change-avatar') {
            avatarAction?.();
            return;
          }
          if (id === 'mark-read') {
            readAction?.run();
            return;
          }
          if (id === 'mute' || id === 'unmute') {
            muteAction?.run();
            return;
          }
          const display = dmMemoryDisplayOf(id);
          if (display !== undefined) {
            if (!dmActions?.hidden.includes('memory')) dmActions?.setMemoryDisplay(display);
            return;
          }
          const dmKind = dmActionKindOf(id);
          if (dmKind !== undefined) {
            dmActions?.toggle(dmKind);
            return;
          }
          if (id === 'bot-model') {
            modelAction?.();
            return;
          }
          if (id === CHANNEL_SETTINGS_ITEM) {
            settingsAction?.run();
            return;
          }
          if (id === CHANNEL_NICKNAME_ITEM) {
            nicknameAction?.();
            return;
          }
          if (id === 'companion') {
            companionAction?.run();
            return;
          }
          if (id === 'share') {
            shareAction?.run();
            return;
          }
          if (id === 'share-market') {
            marketAction?.();
            return;
          }
          if (id === 'delete') {
            deleteAction?.run();
            return;
          }
          if (id === 'pin' || id === 'unpin') {
            onSetPinned?.(menu.channelId, id === 'pin');
            return;
          }
          if (id === 'hide') {
            onHide?.(menu.channelId);
            return;
          }
          if (id === 'rename') {
            onRename?.(menu.channelId);
            return;
          }
          if (id === NEW_SECTION_MOVE_TARGET) {
            onCreateSection?.(menu.channelId);
            return;
          }
          onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

function menuItems(
  t: BotHarnessTranslate,
  gitAvailable: boolean,
  localImports = true,
  team = false,
  member = false,
  people = team,
): MenuEntry[] {
  const disabled = !gitAvailable;
  return [
    {
      id: 'bot',
      label: t('roster.menu.createBot'),
      icon: <Icon name="bot" size={16} />,
      disabled,
    },
    {
      id: 'channel',
      label: t('roster.menu.createChannel'),
      icon: <Icon name="message-square-plus" size={16} />,
    },
    ...(people
      ? [
          {
            id: 'message-person',
            label: t('team.dm.menu'),
            icon: <ChannelSidebarIcon name="user" size={16} />,
          },
        ]
      : []),
    ...(team
      ? [
          {
            id: 'message-bot',
            label: t('team.bots.menu'),
            icon: <ChannelSidebarIcon name="bot" size={16} />,
          },
        ]
      : []),
    {
      id: 'section',
      label: t('roster.menu.createSection'),
      icon: <Icon name="folder-open" size={16} />,
    },
    {
      id: 'marketplace',
      label: localImports
        ? t('roster.menu.marketplace')
        : `${t('roster.menu.marketplace')} · ${t('environment.create.localOnly')}`,
      disabled: !localImports,
      icon: <Icon name="globe" size={16} />,
    },
  ];
}

function sectionCreateMenuItems(
  t: BotHarnessTranslate,
  gitAvailable: boolean,
  member: boolean,
): MenuEntry[] {
  return menuItems(t, gitAvailable, true, false, member).filter(
    (item) => item.id === 'bot' || item.id === 'channel',
  );
}

const sidebarControls = {
  useSidebarSearchInput,
  renderSidebarHeader,
  renderSidebarIcon,
  plainMarkdown,
  BulkChannelMenu,
  ChannelMoveMenu,
  sectionCreateMenuItems,
};

export type SidebarControls = typeof sidebarControls;

export function BotSidebar(props: SidebarProps): ReactElement {
  return useBotSidebar(props, sidebarControls);
}

export { createBotPanelEntry, BotPanelIcon } from './bot-panel-entry.js';
export type { BotPanelEntryProps, BotPanelTutorial } from './bot-panel-entry.js';
export { SectionContextMenu } from './bot-sidebar-sections.js';
export { unreadCountLabel } from './unread-count.js';

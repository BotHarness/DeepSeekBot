import * as stylex from '@stylexjs/stylex';
import { GroupHeading } from './ds/group-heading.js';
import { IconButton } from './ds/icon-button.js';
import { hooked } from './ds/hooked.js';
import { rosterStyles } from './ds/roster-styles.js';
import { Icon } from './ds/icon.js';
import { Menu } from './appearance-primitives.js';
import { RemoteHostRows } from './host-tabs.js';
import { PointerMenu } from './ds/pointer-menu.js';
import { useRef, type ReactElement, type Dispatch, type SetStateAction } from 'react';
import {
  isBotModeSortMode,
  type BotModeSortMode,
} from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { channelRowStatus } from './channel-row-status.js';
import type {
  ChannelDragProps,
  ScopeId,
  ChannelGapDropProps,
  ChannelScopeDropProps,
  SectionDragProps,
} from './channel-drag.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import { gitReady } from './git-unavailable-notice.js';
import {
  defaultStorage,
  saveRosterConfig,
  toggleSectionCollapsed,
  type RosterConfig,
} from './roster-config.js';
import type { RosterSection } from './roster.js';
import { moveWithinOrder, resolveBlockDropTarget, rowDropHalf } from './roster-order.js';
import {
  ChannelRenameModal,
  SectionDeleteModal,
  SectionRenameModal,
  sectionMenuItems,
} from './section-management.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import type { EnvironmentChannel } from './environment-channels.js';
import type {
  SidebarState,
  ChannelMenuRequest,
  SectionMenuRequest,
  CreateRequest,
  FlatBlockView,
} from './bot-sidebar-types.js';
import { botCreateSource } from './bot-sidebar-creation.js';
import type { SidebarControls } from './bot-sidebar.js';

export function SectionContextMenu({
  menu,
  index,
  count,
  selectedId,
  t,
  onSelect,
  onClose,
}: {
  menu: SectionMenuRequest;
  index: number;
  count: number;
  selectedId: string;
  t: BotHarnessTranslate;
  onSelect: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  return (
    <span hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={sectionMenuItems(t, {
          canMoveUp: index > 0,
          canMoveDown: index >= 0 && index < count - 1,
        })}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={onClose}
      />
    </span>
  );
}

export function renderSidebarSections({
  showSource,
  environmentChannels,
  renderChannelRow,
  sectionOfChannel,
  query,
  onOpenConversation,
  t,
  flatBlocks,
  channelDragActive,
  channelDragProps,
  botBySlug,
  state,
  listNow,
  sectionMenuId,
  sectionCreateMenuId,
  sectionDragProps,
  channelGapDropProps,
  channelScopeDropProps,
  setMenuOpen,
  setSortMenuOpen,
  setSectionMenuId,
  setSectionCreateMenuId,
  setChannelMenu,
  setSectionContextMenu,
  toggleSection,
  prefs,
  selectSectionMenu,
  member,
  setCreateRequest,
  sectionCreateMenuItems,
}: {
  showSource: boolean;
  environmentChannels: EnvironmentChannel[];
  renderChannelRow: (channel: ChannelSummary, scopeId: ScopeId) => ReactElement;
  sectionOfChannel: (channelId: string) => string | undefined;
  query: string;
  onOpenConversation: (() => void) | undefined;
  t: BotHarnessTranslate;
  flatBlocks: FlatBlockView[];
  channelDragActive: boolean;
  channelDragProps: (scopeId: ScopeId, channelId: string) => ChannelDragProps;
  botBySlug: ReadonlyMap<string, BotSummary>;
  state: SidebarState;
  listNow: number;
  sectionMenuId: string | undefined;
  sectionCreateMenuId: string | undefined;
  sectionDragProps: (sectionId: string) => SectionDragProps;
  channelGapDropProps: (sectionId: string) => ChannelGapDropProps;
  channelScopeDropProps: (scopeId: ScopeId) => ChannelScopeDropProps;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSortMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSectionMenuId: Dispatch<SetStateAction<string | undefined>>;
  setSectionCreateMenuId: Dispatch<SetStateAction<string | undefined>>;
  setChannelMenu: Dispatch<SetStateAction<ChannelMenuRequest | undefined>>;
  setSectionContextMenu: Dispatch<SetStateAction<SectionMenuRequest | undefined>>;
  toggleSection: (sectionId: string) => void;
  prefs: BotModePrefsSnapshot;
  selectSectionMenu: (section: RosterSection, id: string) => void;
  member: boolean;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  sectionCreateMenuItems: SidebarControls['sectionCreateMenuItems'];
}): ReactElement {
  return (
    <div className="bh-roster-list">
      {showSource
        ? environmentChannels.map((entry) => (
            <div key={entry.key} data-environment-channel={entry.key}>
              {entry.kind === 'local' ? (
                renderChannelRow(entry.channel, sectionOfChannel(entry.channel.id))
              ) : (
                <RemoteHostRows
                  remote={entry.remote}
                  query={query}
                  showSource
                  onOpen={onOpenConversation}
                  rowsOverride={[entry.row]}
                  t={t}
                />
              )}
            </div>
          ))
        : flatBlocks.map((block) => {
            if (block.kind === 'loose') {
              const key = `loose:${block.channels.map((channel) => channel.id).join(',')}`;
              return (
                <div key={key} className="bh-section bh-loose">
                  <div
                    className="bh-list-area"
                    onDragOver={(event) => {
                      if (!channelDragActive) return;
                      const target = event.target as HTMLElement | null;
                      if (target !== null && target.closest('[data-channel-id]') !== null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const rows = [
                        ...event.currentTarget.querySelectorAll('[data-channel-id]'),
                      ].map((element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      });
                      const resolution = resolveBlockDropTarget(
                        rows.filter((row) => row.id !== ''),
                        Number.NEGATIVE_INFINITY,
                        event.clientY,
                      );
                      if (resolution.kind === 'row') {
                        channelDragProps(undefined, resolution.channelId).hover(resolution.half);
                      }
                    }}
                    onDrop={(event) => {
                      if (!channelDragActive) return;
                      const target = event.target as HTMLElement | null;
                      if (target !== null && target.closest('[data-channel-id]') !== null) return;
                      event.preventDefault();
                      const rows = [
                        ...event.currentTarget.querySelectorAll('[data-channel-id]'),
                      ].map((element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      });
                      const resolution = resolveBlockDropTarget(
                        rows.filter((row) => row.id !== ''),
                        Number.NEGATIVE_INFINITY,
                        event.clientY,
                      );
                      if (resolution.kind === 'row') {
                        event.stopPropagation();
                        channelDragProps(undefined, resolution.channelId).drop(resolution.half);
                      }
                    }}
                  >
                    {block.channels.map((channel) => renderChannelRow(channel, undefined))}
                  </div>
                </div>
              );
            }
            const { section, channels: sectionChannels } = block;
            const needCount = sectionChannels.filter((channel) => {
              const bot =
                channel.type === 'dm' && channel.botSlug !== undefined
                  ? botBySlug.get(channel.botSlug)
                  : undefined;
              if (bot === undefined) return false;
              const status = channelRowStatus({
                activity: personaBotActivity(state, bot),
                attention: bot.attention,
                paused: bot.paused,
                unread: 0,
                botSlug: bot.slug,
                latest: undefined,
                now: listNow,
              });
              return status === 'needs-you' || status === 'blocked';
            }).length;
            const sectionIndex = state.roster.sections.findIndex((item) => item.id === section.id);
            const collapsed = state.config.collapsed[section.id] === true;
            const menuOpenForSection = sectionMenuId === section.id;
            const createMenuOpenForSection = sectionCreateMenuId === section.id;
            const sectionDrag = sectionDragProps(section.id);
            const channelGap = channelGapDropProps(section.id);
            const channelScope = channelScopeDropProps(section.id);
            const before = sectionDrag.marker === 'before' || channelGap.marker === 'before';
            const after = sectionDrag.marker === 'after' || channelGap.marker === 'after';
            const blockMarkerClass = `${before ? ' bh-drop-before' : ''}${after ? ' bh-drop-after' : ''}${channelScope.hovered ? ' bh-drop-scope' : ''}`;
            const resolveBlockTarget = (element: HTMLElement, clientY: number) => {
              const rows = [...element.querySelectorAll('[data-channel-id]')].map((row, index) => {
                const rect = row.getBoundingClientRect();
                return {
                  id: sectionChannels[index]?.id ?? '',
                  top: rect.top,
                  height: rect.height,
                };
              });
              const headBottom =
                element.querySelector('.bh-section-head')?.getBoundingClientRect().bottom ??
                clientY;
              return resolveBlockDropTarget(
                rows.filter((row) => row.id !== ''),
                headBottom,
                clientY,
              );
            };
            const openSectionContextMenu = (x: number, y: number): void => {
              setMenuOpen(false);
              setSortMenuOpen(false);
              setSectionMenuId(undefined);
              setSectionCreateMenuId(undefined);
              setChannelMenu(undefined);
              setSectionContextMenu({ sectionId: section.id, x, y });
            };
            return (
              <div
                key={section.id}
                data-section-id={section.id}
                className={`bh-section${blockMarkerClass}`}
                onContextMenu={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target !== null && target.closest('[data-channel-id]') !== null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  openSectionContextMenu(event.clientX, event.clientY);
                }}
                onDragOver={(event) => {
                  if (sectionDrag.active) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    sectionDrag.hover(
                      rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                    );
                    return;
                  }
                  if (!channelDragActive) return;
                  const target = event.target as HTMLElement | null;
                  if (target !== null && target.closest('[data-channel-id]') !== null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                  if (resolution.kind === 'scope') channelScope.hover();
                  else channelDragProps(section.id, resolution.channelId).hover(resolution.half);
                }}
                onDrop={(event) => {
                  if (sectionDrag.active) {
                    event.preventDefault();
                    event.stopPropagation();
                    sectionDrag.drop(
                      rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                    );
                    return;
                  }
                  if (!channelDragActive) return;
                  const target = event.target as HTMLElement | null;
                  if (target !== null && target.closest('[data-channel-id]') !== null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                  if (resolution.kind === 'scope') channelScope.drop();
                  else channelDragProps(section.id, resolution.channelId).drop(resolution.half);
                }}
              >
                <div className="bh-list-area">
                  <div {...stylex.props(rosterStyles.section)}>
                    <GroupHeading
                      xstyle={rosterStyles.sectionToggle}
                      label={<span className="bh-section-name">{section.name}</span>}
                      count={sectionChannels.length}
                      expanded={!collapsed}
                      quiet
                      animateChevron={false}
                      onToggle={() => toggleSection(section.id)}
                      button={{
                        className: 'bh-section-head',
                        draggable: true,
                        onDragStart: (event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', section.id);
                          sectionDrag.start();
                        },
                        onDragEnd: sectionDrag.end,
                        onKeyDown: (event) => {
                          const keyboardMenu =
                            event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
                          if (!keyboardMenu) return;
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          openSectionContextMenu(rect.left + 8, rect.bottom);
                        },
                      }}
                    />
                    {needCount > 0 ? (
                      <span {...hooked('bh-section-needs', rosterStyles.sectionAttention)}>
                        {t(needCount === 1 ? 'roster.needsYouCountOne' : 'roster.needsYouCount', {
                          count: needCount,
                        })}
                      </span>
                    ) : null}
                    <span {...hooked('bh-row-actions', rosterStyles.sectionControls)}>
                      <Menu
                        open={menuOpenForSection}
                        portal
                        dense
                        align="end"
                        closeOnPointerLeave
                        anchor={
                          <IconButton
                            type="button"
                            size="inline"
                            className="bh-row-action"
                            aria-label={t('roster.section.sort', {
                              name: section.name,
                            })}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSectionMenuId((value) =>
                                value === section.id ? undefined : section.id,
                              );
                              setSectionCreateMenuId(undefined);
                            }}
                          >
                            <Icon name="ellipsis" />
                          </IconButton>
                        }
                        items={sectionMenuItems(t, {
                          canMoveUp: sectionIndex > 0,
                          canMoveDown: sectionIndex < state.roster.sections.length - 1,
                        })}
                        selectedId={sectionSortMode(prefs, section.id)}
                        onSelect={(id) => selectSectionMenu(section, id)}
                        onClose={() => {
                          setSectionMenuId(undefined);
                        }}
                      />
                      <Menu
                        open={createMenuOpenForSection}
                        portal
                        dense
                        align="end"
                        closeOnPointerLeave
                        anchor={
                          <IconButton
                            type="button"
                            size="inline"
                            className="bh-row-action"
                            aria-label={t('roster.section.create', {
                              name: section.name,
                            })}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSectionMenuId(undefined);
                              setSectionCreateMenuId((value) =>
                                value === section.id ? undefined : section.id,
                              );
                            }}
                          >
                            <Icon name="plus" />
                          </IconButton>
                        }
                        items={sectionCreateMenuItems(t, gitReady(state.git), member)}
                        onSelect={(id) => {
                          setSectionCreateMenuId(undefined);
                          if (id === 'bot')
                            setCreateRequest({
                              kind: 'bot-source',
                              sectionId: section.id,
                            });
                          const source = botCreateSource(id);
                          if (source !== undefined) {
                            setCreateRequest({
                              kind: 'bot',
                              source,
                              sectionId: section.id,
                            });
                          }
                          if (id === 'channel') {
                            setCreateRequest({
                              kind: 'channel',
                              sectionId: section.id,
                            });
                          }
                        }}
                        onClose={() => {
                          setSectionCreateMenuId(undefined);
                        }}
                      />
                    </span>
                  </div>
                  {collapsed
                    ? null
                    : sectionChannels.map((channel) => renderChannelRow(channel, section.id))}
                </div>
              </div>
            );
          })}
    </div>
  );
}

export function sidebarSectionActions({
  state,
  sectionContextMenu,
  setSectionMenuId,
  setSectionContextMenu,
  setSectionSortMode,
  actions,
  setRenameTarget,
  setDeleteTarget,
}: {
  state: SidebarState;
  sectionContextMenu: SectionMenuRequest | undefined;
  setSectionMenuId: Dispatch<SetStateAction<string | undefined>>;
  setSectionContextMenu: Dispatch<SetStateAction<SectionMenuRequest | undefined>>;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  actions: BridgeActions;
  setRenameTarget: Dispatch<SetStateAction<RosterSection | undefined>>;
  setDeleteTarget: Dispatch<SetStateAction<RosterSection | undefined>>;
}) {
  const contextSection = state.roster.sections.find(
    (section) => section.id === sectionContextMenu?.sectionId,
  );
  const contextSectionIndex =
    contextSection === undefined ? -1 : state.roster.sections.indexOf(contextSection);

  const persistConfig = (next: RosterConfig): void => {
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };
  const selectSectionMenu = (section: RosterSection, id: string): void => {
    setSectionMenuId(undefined);
    setSectionContextMenu(undefined);
    if (id === 'inherit') {
      setSectionSortMode(section.id, undefined);
      return;
    }
    if (isBotModeSortMode(id)) {
      setSectionSortMode(section.id, id);
      return;
    }
    if (id === 'move-up' || id === 'move-down') {
      const sections = store.getSnapshot().roster.sections;
      const index = sections.findIndex((candidate) => candidate.id === section.id);
      const target = sections[index + (id === 'move-up' ? -1 : 1)];
      if (target === undefined) return;
      const order = moveWithinOrder(
        sections.map((candidate) => candidate.id),
        section.id,
        target.id,
        id === 'move-up' ? 'before' : 'after',
      );
      if (order !== undefined) void actions.reorderSections(order);
      return;
    }
    if (id === 'rename') {
      setRenameTarget(section);
      return;
    }
    if (id === 'delete') {
      setDeleteTarget(section);
    }
  };

  const toggleSection = (sectionId: string): void => {
    persistConfig(toggleSectionCollapsed(store.getSnapshot().config, sectionId));
  };
  return { contextSection, contextSectionIndex, selectSectionMenu, toggleSection };
}

export function renderSectionDialogs({
  renameTarget,
  t,
  setRenameTarget,
  actions,
  channelRenameTarget,
  setChannelRenameTarget,
  deleteTarget,
  setDeleteTarget,
  setSectionSortMode,
  createSectionId,
  setCreateRequest,
  sectionContextMenu,
  contextSection,
  contextSectionIndex,
  state,
  prefs,
  selectSectionMenu,
  setSectionContextMenu,
}: {
  renameTarget: RosterSection | undefined;
  t: BotHarnessTranslate;
  setRenameTarget: Dispatch<SetStateAction<RosterSection | undefined>>;
  actions: BridgeActions;
  channelRenameTarget: ChannelSummary | undefined;
  setChannelRenameTarget: Dispatch<SetStateAction<ChannelSummary | undefined>>;
  deleteTarget: RosterSection | undefined;
  setDeleteTarget: Dispatch<SetStateAction<RosterSection | undefined>>;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  createSectionId: string | undefined;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  sectionContextMenu: SectionMenuRequest | undefined;
  contextSection: RosterSection | undefined;
  contextSectionIndex: number;
  state: SidebarState;
  prefs: BotModePrefsSnapshot;
  selectSectionMenu: (section: RosterSection, id: string) => void;
  setSectionContextMenu: Dispatch<SetStateAction<SectionMenuRequest | undefined>>;
}) {
  return {
    renameSection:
      renameTarget !== undefined ? (
        <SectionRenameModal
          t={t}
          key={renameTarget.id}
          section={renameTarget}
          onCancel={() => {
            setRenameTarget(undefined);
          }}
          onRename={async (name) => {
            if (!(await actions.renameSection(renameTarget.id, name))) return false;
            setRenameTarget(undefined);
            return true;
          }}
        />
      ) : null,
    renameChannel:
      channelRenameTarget !== undefined ? (
        <ChannelRenameModal
          t={t}
          key={channelRenameTarget.id}
          name={channelRenameTarget.name}
          bot={channelRenameTarget.type === 'dm'}
          onCancel={() => {
            setChannelRenameTarget(undefined);
          }}
          onRename={(name) => {
            void actions.renameChannel(channelRenameTarget.id, name);
            setChannelRenameTarget(undefined);
          }}
        />
      ) : null,
    deleteSection:
      deleteTarget !== undefined ? (
        <SectionDeleteModal
          t={t}
          section={deleteTarget}
          onCancel={() => {
            setDeleteTarget(undefined);
          }}
          onDelete={async () => {
            if (!(await actions.removeSection(deleteTarget.id))) return false;
            setSectionSortMode(deleteTarget.id, undefined);
            if (createSectionId === deleteTarget.id) setCreateRequest(undefined);
            setDeleteTarget(undefined);
            return true;
          }}
        />
      ) : null,
    sectionMenu:
      sectionContextMenu !== undefined && contextSection !== undefined ? (
        <SectionContextMenu
          menu={sectionContextMenu}
          index={contextSectionIndex}
          count={state.roster.sections.length}
          selectedId={sectionSortMode(prefs, contextSection.id)}
          t={t}
          onSelect={(id) => selectSectionMenu(contextSection, id)}
          onClose={() => {
            setSectionContextMenu(undefined);
          }}
        />
      ) : null,
  };
}

export function resolveGapTarget(
  root: HTMLElement,
  clientY: number,
): { sectionId: string; half: 'before' | 'after' } | null {
  const band = 12;
  const sectionSelector = '.bh-section[data-section-id]';
  const blocks = [...root.querySelectorAll(sectionSelector)]
    .map((element) => ({
      id: element.getAttribute('data-section-id') ?? '',
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
    }))
    .filter((block) => block.id !== '');
  for (const block of blocks) {
    if (clientY >= block.top - band && clientY < block.top) {
      return { sectionId: block.id, half: 'before' };
    }
    if (clientY >= block.bottom && clientY < block.bottom + band) {
      return { sectionId: block.id, half: 'after' };
    }
  }
  return null;
}

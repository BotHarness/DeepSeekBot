import { useState, type Dispatch, type SetStateAction } from 'react';
import { Toast } from './ds/toast.js';
import type { BridgeActions } from './actions.js';
import type { WindowCompanions } from './window-companions.js';
import type { ChannelSelection } from './channel-selection.js';
import type { BotHarnessTranslate } from './locale.js';
import { BotAvatarModal } from './profile-header.js';
import { BotZipShareDialog } from './bot-zip.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import { NicknameDialog } from './human-channel-name.js';
import { useDmMemoryDisplay, useHiddenDmActions } from './channel-options.js';
import { channelSettings, isChannelSettingsSection } from './channel-settings-state.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import {
  setDmMemoryDisplay,
  toggleHiddenDmAction,
  type DmActionKind,
  type DmMemoryDisplay,
} from './dm-actions.js';
import { MarketUploadDialog } from './market-upload.js';
import { MARKET_PANEL } from './market-panel.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import {
  errorMessage,
  type ModelCatalogView,
  type ModelPlanStateView,
  type ModelRouteView,
} from './bridge.js';
import { rememberModelPlan } from './model-plan-store.js';
import { applyBotModelRoute, botModelMenuGroups } from './bot-model-route.js';
import { useMountedResource } from './mounted-resource.js';
import { reportFailure } from './diagnostic-log.js';
import type {
  SidebarState,
  ChannelMenuRequest,
  SectionMenuRequest,
  CreateRequest,
} from './bot-sidebar-types.js';
import type { SidebarControls } from './bot-sidebar.js';

function hasChannelSettings(
  registry: ChannelSidebarRegistry | undefined,
  channel: ChannelSummary,
): boolean {
  if (registry === undefined) return false;
  const scope = channel.type === 'dm' && channel.botSlug !== undefined ? 'personabot' : 'channel';
  return registry.entries(scope).some(isChannelSettingsSection);
}

export function useSidebarChannelMenu({
  state,
  actions,
  t,
}: {
  state: SidebarState;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}) {
  const [channelMenu, setChannelMenu] = useState<ChannelMenuRequest | undefined>(undefined);
  const [sharing, setSharing] = useState<BotSummary | undefined>(undefined);
  const [avatarTarget, setAvatarTarget] = useState<{ slug: string; channelId: string } | undefined>(
    undefined,
  );
  const [publishing, setPublishing] = useState<BotSummary | undefined>(undefined);
  const [deleting, setDeleting] = useState<BotSummary | undefined>(undefined);
  const [nicknameTarget, setNicknameTarget] = useState<ChannelSummary | undefined>(undefined);
  const menuBotSlug = state.channels.find(
    (candidate) => candidate.id === channelMenu?.channelId && candidate.type === 'dm',
  )?.botSlug;
  const menuModelSlug = state.bots.some((bot) => bot.slug === menuBotSlug && bot.deleted !== true)
    ? menuBotSlug
    : undefined;
  const [menuModelOptions, setMenuModelOptions] = useState<{
    slug: string;
    catalog: ModelCatalogView;
    state: ModelPlanStateView;
  }>();
  const menuModelData = menuModelOptions?.slug === menuModelSlug ? menuModelOptions : undefined;
  const [menuModelBusy, setMenuModelBusy] = useState(false);
  const [menuModelError, setMenuModelError] = useState<string | undefined>(undefined);
  const menuModelMount = useMountedResource<HTMLSpanElement>(() => {
    setMenuModelOptions(undefined);
    if (menuModelSlug === undefined) return;
    let active = true;
    void Promise.all([actions.modelCatalog(), actions.modelPlanState(menuModelSlug)]).then(
      ([catalog, planState]) => {
        if (!active) return;
        rememberModelPlan(menuModelSlug, planState.plan, actions);
        setMenuModelOptions({ slug: menuModelSlug, catalog, state: planState });
      },
      (failure: unknown) => {
        if (active) setMenuModelError(`${t('modelPreset.loadFailed')}: ${errorMessage(failure)}`);
      },
    );
    return () => {
      active = false;
    };
  }, [actions, menuModelSlug]);
  const applyMenuModel = (route: ModelRouteView): void => {
    if (menuModelSlug === undefined || menuModelData === undefined || menuModelBusy) return;
    setMenuModelBusy(true);
    void applyBotModelRoute(actions, menuModelSlug, menuModelData.state, route)
      .then((plan) => {
        setMenuModelOptions((current) =>
          current?.slug === menuModelSlug
            ? { ...current, state: { revision: plan.revision, plan } }
            : current,
        );
      })
      .catch((failure: unknown) => {
        setMenuModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
      })
      .finally(() => {
        setMenuModelBusy(false);
        setChannelMenu((current) => (current === channelMenu ? undefined : current));
      });
  };
  const menuHiddenDmActions = useHiddenDmActions(
    channelMenu === undefined
      ? undefined
      : state.channels.find(
          (candidate) => candidate.id === channelMenu.channelId && candidate.type === 'dm',
        )?.botSlug,
  );
  const menuMemoryDisplay = useDmMemoryDisplay(menuBotSlug);
  const openChannelSettings = async (channel: ChannelSummary): Promise<void> => {
    if (store.getSnapshot().conversation.channel?.id !== channel.id)
      await (channel.botSlug === undefined
        ? actions.openChannel(channel.id)
        : actions.openBot(channel.botSlug));
    channelSettings.open(channelSettings.attentionOf(channel.id)[0]);
  };
  return {
    channelMenu,
    setChannelMenu,
    sharing,
    setSharing,
    avatarTarget,
    setAvatarTarget,
    publishing,
    setPublishing,
    menuBotSlug,
    deleting,
    setDeleting,
    nicknameTarget,
    setNicknameTarget,
    menuModelSlug,
    menuModelData,
    menuModelBusy,
    menuModelError,
    setMenuModelError,
    menuModelMount,
    applyMenuModel,
    menuHiddenDmActions,
    menuMemoryDisplay,
    openChannelSettings,
  };
}

export function sidebarChannelMenuOpener({
  menu,
  selectedChannelSet,
  selectedChannelIds,
  setChannelSelection,
  setMenuOpen,
  setSortMenuOpen,
  setSectionMenuId,
  setSectionCreateMenuId,
  setSectionContextMenu,
}: {
  menu: Pick<ReturnType<typeof useSidebarChannelMenu>, 'setMenuModelError' | 'setChannelMenu'>;
  selectedChannelSet: Set<string>;
  selectedChannelIds: readonly string[];
  setChannelSelection: Dispatch<SetStateAction<ChannelSelection>>;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSortMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSectionMenuId: Dispatch<SetStateAction<string | undefined>>;
  setSectionCreateMenuId: Dispatch<SetStateAction<string | undefined>>;
  setSectionContextMenu: Dispatch<SetStateAction<SectionMenuRequest | undefined>>;
}) {
  const { setMenuModelError, setChannelMenu } = menu;
  return (request: ChannelMenuRequest): void => {
    const inSelection = selectedChannelSet.has(request.channelId);
    const channelIds =
      inSelection && selectedChannelIds.length > 1 ? selectedChannelIds : [request.channelId];
    if (!inSelection) setChannelSelection({ ids: [], anchorId: request.channelId });
    setMenuOpen(false);
    setSortMenuOpen(false);
    setSectionMenuId(undefined);
    setSectionCreateMenuId(undefined);
    setSectionContextMenu(undefined);
    setMenuModelError(undefined);
    setChannelMenu({ ...request, channelIds });
  };
}

export function renderSidebarChannelActions({
  menu,
  allScope,
  state,
  selectedItems,
  allPinnedChannelSet,
  t,
  setCreateRequest,
  commitBulkPin,
  commitBulkHide,
  commitBulkMove,
  sectionOfChannel,
  channelUnread,
  actions,
  mutedChannelSet,
  onViewProfile,
  channelSidebar,
  dockPanels,
  companion,
  setChannelRenameTarget,
  offerUndo,
  conversationName,
  commitChannelMenuMove,
  ChannelMoveMenu,
  BulkChannelMenu,
}: {
  menu: ReturnType<typeof useSidebarChannelMenu>;
  allScope: boolean;
  state: SidebarState;
  selectedItems: string;
  allPinnedChannelSet: Set<string>;
  t: BotHarnessTranslate;
  setCreateRequest: Dispatch<SetStateAction<CreateRequest | undefined>>;
  commitBulkPin: (ids: readonly string[], targetPinned: boolean) => Promise<void>;
  commitBulkHide: (ids: readonly string[]) => Promise<void>;
  commitBulkMove: (ids: readonly string[], targetSectionId: string | undefined) => Promise<void>;
  sectionOfChannel: (channelId: string) => string | undefined;
  channelUnread: Readonly<Record<string, number>>;
  actions: BridgeActions;
  mutedChannelSet: Set<string>;
  onViewProfile: ((slug: string) => void) | undefined;
  channelSidebar: ChannelSidebarRegistry | undefined;
  dockPanels: DockPanelRegistry | undefined;
  companion: WindowCompanions | undefined;
  setChannelRenameTarget: Dispatch<SetStateAction<ChannelSummary | undefined>>;
  offerUndo: (text: string, undo: () => Promise<unknown>) => void;
  conversationName: (channelId: string) => string;
  commitChannelMenuMove: (
    channelId: string,
    targetSectionId: string | undefined,
    pinned: boolean,
  ) => void;
  ChannelMoveMenu: SidebarControls['ChannelMoveMenu'];
  BulkChannelMenu: SidebarControls['BulkChannelMenu'];
}) {
  const {
    channelMenu,
    setChannelMenu,
    sharing,
    setSharing,
    avatarTarget,
    setAvatarTarget,
    publishing,
    setPublishing,
    menuBotSlug,
    deleting,
    setDeleting,
    nicknameTarget,
    setNicknameTarget,
    menuModelSlug,
    menuModelData,
    menuModelBusy,
    menuModelError,
    setMenuModelError,
    applyMenuModel,
    menuHiddenDmActions,
    menuMemoryDisplay,
    openChannelSettings,
  } = menu;
  return {
    channelActionsMenu:
      channelMenu !== undefined && (channelMenu.channelIds?.length ?? 0) > 1 ? (
        <BulkChannelMenu
          sectionManagement={!allScope}
          menu={channelMenu}
          sections={state.roster.sections}
          itemsLabel={selectedItems}
          allPinned={(channelMenu.channelIds ?? []).every((id) => allPinnedChannelSet.has(id))}
          t={t}
          onCreateSection={() => {
            setCreateRequest({
              kind: 'section',
              moveChannelIds: channelMenu.channelIds ?? [],
            });
            setChannelMenu(undefined);
          }}
          onPin={(pinned) => void commitBulkPin(channelMenu.channelIds ?? [], pinned)}
          onHide={() => void commitBulkHide(channelMenu.channelIds ?? [])}
          onPick={(sectionId) => void commitBulkMove(channelMenu.channelIds ?? [], sectionId)}
          onClose={() => setChannelMenu(undefined)}
        />
      ) : channelMenu !== undefined ? (
        <ChannelMoveMenu
          sectionManagement={!allScope}
          menu={channelMenu}
          sections={state.roster.sections}
          currentSectionId={sectionOfChannel(channelMenu.channelId)}
          pinned={channelMenu.pinnedView === true}
          t={t}
          readAction={
            (channelUnread[channelMenu.channelId] ?? 0) > 0
              ? {
                  label: t('roster.markRead'),
                  run: () => {
                    void actions.markChannelRead(channelMenu.channelId).catch((error: unknown) => {
                      reportFailure('mark-read-failed', 'mark read failed', error);
                    });
                    setChannelMenu(undefined);
                  },
                }
              : undefined
          }
          muteAction={(() => {
            const muted = mutedChannelSet.has(channelMenu.channelId);
            return {
              label: t(muted ? 'roster.unmute' : 'roster.mute'),
              muted,
              run: () => {
                void actions.setChannelMuted(channelMenu.channelId, !muted);
                setChannelMenu(undefined);
              },
            };
          })()}
          profileAction={
            menuBotSlug === undefined
              ? undefined
              : () => {
                  setChannelMenu(undefined);
                  if (onViewProfile) onViewProfile(menuBotSlug);
                  else void actions.openBot(menuBotSlug, 'profile');
                }
          }
          avatarAction={(() => {
            const bot = state.bots.find((item) => item.slug === menuBotSlug);
            if (bot === undefined || bot.deleted === true) return undefined;
            const channelId = channelMenu.channelId;
            return () => {
              setAvatarTarget({ slug: bot.slug, channelId });
              setChannelMenu(undefined);
            };
          })()}
          settingsAction={(() => {
            const channel = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId,
            );
            if (channel === undefined || !hasChannelSettings(channelSidebar, channel))
              return undefined;
            return {
              attention: channelSettings.attentionOf(channel.id).length > 0,
              run: () => {
                setChannelMenu(undefined);
                void openChannelSettings(channel);
              },
            };
          })()}
          nicknameAction={(() => {
            const channel = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId,
            );
            if (channel?.humanNickname === undefined) return undefined;
            return () => {
              setNicknameTarget(channel);
              setChannelMenu(undefined);
            };
          })()}
          dmActions={(() => {
            const botSlug = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId && candidate.type === 'dm',
            )?.botSlug;
            if (botSlug === undefined) return undefined;
            return {
              hidden: menuHiddenDmActions,
              memoryDisplay: menuMemoryDisplay,
              setMemoryDisplay: (value: DmMemoryDisplay) => setDmMemoryDisplay(botSlug, value),
              toggle: (kind: DmActionKind) => toggleHiddenDmAction(botSlug, kind),
            };
          })()}
          modelAction={
            menuModelSlug === undefined
              ? undefined
              : {
                  groups: botModelMenuGroups(
                    menuModelData?.state.plan?.orchestrator ?? menuModelData?.catalog.default,
                    menuModelData?.catalog,
                    t('modelPreset.providerDefault'),
                  ),
                  disabled: menuModelBusy || menuModelData === undefined,
                  apply: applyMenuModel,
                }
          }
          shareAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId && channel.type === 'dm',
            )?.botSlug;
            const bot = state.bots.find((item) => item.slug === botId);
            if (bot === undefined || bot.deleted === true) return undefined;
            return {
              label: t('profile.share'),
              run: () => {
                setSharing(bot);
                setChannelMenu(undefined);
              },
            };
          })()}
          deleteAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId && channel.type === 'dm',
            )?.botSlug;
            const bot = state.bots.find((item) => item.slug === botId);
            if (bot === undefined || bot.deleted === true) return undefined;
            return {
              label: t('deletion.title'),
              run: () => {
                setDeleting(bot);
                setChannelMenu(undefined);
              },
            };
          })()}
          marketAction={(() => {
            if (dockPanels === undefined) return undefined;
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId && channel.type === 'dm',
            )?.botSlug;
            const bot = state.bots.find((item) => item.slug === botId);
            if (bot === undefined || bot.deleted === true || bot.tob !== undefined)
              return undefined;
            return () => {
              setPublishing(bot);
              setChannelMenu(undefined);
            };
          })()}
          companionAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId,
            )?.botSlug;
            if (botId === undefined || companion === undefined || !companion.getSnapshot().ready)
              return undefined;
            const selected = companion.get(botId) !== undefined;
            return {
              label: t(selected ? 'companion.remove' : 'companion.show'),
              run: () => {
                if (selected) companion.remove(botId);
                else companion.select(botId);
                setChannelMenu(undefined);
              },
            };
          })()}
          onSetPinned={(channelId, pinned) => {
            void actions.setChannelPinned(channelId, pinned);
            setChannelMenu(undefined);
          }}
          onRename={(channelId) => {
            const channel = state.channels.find((candidate) => candidate.id === channelId);
            if (channel !== undefined) setChannelRenameTarget(channel);
            setChannelMenu(undefined);
          }}
          onCreateSection={(channelId) => {
            setCreateRequest({
              kind: 'section',
              moveChannelId: channelId,
              pinned: channelMenu.pinnedView === true,
            });
            setChannelMenu(undefined);
          }}
          onHide={(channelId) => {
            void actions.setChannelHidden(channelId, true).then((succeeded) => {
              if (succeeded)
                offerUndo(t('undo.hidden', { name: conversationName(channelId) }), () =>
                  actions.setChannelHidden(channelId, false),
                );
            });
            setChannelMenu(undefined);
          }}
          onPick={(targetSectionId) => {
            commitChannelMenuMove(
              channelMenu.channelId,
              targetSectionId,
              channelMenu.pinnedView === true,
            );
            setChannelMenu(undefined);
          }}
          onClose={() => {
            setChannelMenu(undefined);
          }}
        />
      ) : null,
    nicknameDialog:
      nicknameTarget === undefined ? null : (
        <NicknameDialog
          key={nicknameTarget.id}
          channel={nicknameTarget}
          actions={actions}
          t={t}
          onClose={() => setNicknameTarget(undefined)}
        />
      ),
    publishingDialog:
      publishing === undefined || dockPanels === undefined ? null : (
        <MarketUploadDialog
          key={publishing.slug}
          actions={actions}
          registry={dockPanels}
          t={t}
          initialSlug={publishing.slug}
          onListed={() => dockPanels.open(MARKET_PANEL)}
          onClose={() => setPublishing(undefined)}
        />
      ),
    avatarDialog: (() => {
      if (avatarTarget === undefined) return null;
      const bot = state.bots.find((item) => item.slug === avatarTarget.slug);
      const channel = state.channels.find((item) => item.id === avatarTarget.channelId);
      if (bot === undefined || channel === undefined || bot.deleted === true) return null;
      return (
        <BotAvatarModal
          key={bot.slug}
          bot={bot}
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setAvatarTarget(undefined)}
        />
      );
    })(),
    sharingDialog:
      sharing === undefined ? null : (
        <BotZipShareDialog
          key={sharing.slug}
          bot={sharing}
          actions={actions}
          t={t}
          onClose={() => setSharing(undefined)}
        />
      ),
    deletionDialog:
      deleting === undefined ? null : (
        <PersonaBotDeletionView
          key={deleting.slug}
          slug={deleting.slug}
          actions={actions}
          t={t}
          onClose={() => setDeleting(undefined)}
        />
      ),
    modelErrorToast:
      menuModelError === undefined ? null : (
        <Toast
          key="menu-model-error"
          text={menuModelError}
          holdMs={6000}
          onDone={() => setMenuModelError(undefined)}
        />
      ),
  };
}

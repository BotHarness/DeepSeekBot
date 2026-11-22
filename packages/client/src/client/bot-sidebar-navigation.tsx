import { remoteHosts } from './remote-hosts.js';
import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';
import type { BridgeActions } from './actions.js';
import {
  steppedConversationId,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webModalOpen,
  webQuickSwitcherBlocked,
  webShortcutBlocked,
} from './channel-shortcuts.js';
import { QuickSwitcher, type QuickSwitcherSettings } from './quick-switcher.js';
import type { QuickSwitcherSource } from './quick-switcher-launcher.js';
import { ShortcutBindings } from './shortcut-bindings.js';
import { quickSwitcherEntries, type QuickSwitcherEntry } from './quick-switcher-rank.js';
import {
  reconcileChannelSelection,
  selectChannels,
  type ChannelSelection,
  type ChannelSelectionGesture,
} from './channel-selection.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import type { MessageSearchHit } from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import type { SidebarState } from './bot-sidebar-types.js';

export function useSidebarNavigation({
  wide,
  visibleChannelIds,
  railPinnedChannels,
  railChannels,
  onOpenConversation,
  quickSwitcherSettings,
  setShowShortcutHints,
  setChannelSelection,
  actions,
  shortcutBindings,
  setQuickSwitcherSource,
  pinZoneArmTimer,
  state,
}: {
  wide: boolean;
  visibleChannelIds: string[];
  railPinnedChannels: ChannelSummary[];
  railChannels: ChannelSummary[];
  onOpenConversation: (() => void) | undefined;
  quickSwitcherSettings: QuickSwitcherSettings | undefined;
  setShowShortcutHints: Dispatch<SetStateAction<boolean>>;
  setChannelSelection: Dispatch<SetStateAction<ChannelSelection>>;
  actions: BridgeActions;
  shortcutBindings: ShortcutBindings;
  setQuickSwitcherSource: Dispatch<SetStateAction<QuickSwitcherSource | undefined>>;
  pinZoneArmTimer: MutableRefObject<number | undefined>;
  state: SidebarState;
}) {
  const shortcutIds = wide
    ? visibleChannelIds
    : [...railPinnedChannels, ...railChannels].map((channel) => channel.id);
  const shortcutIdsRef = useRef<readonly string[]>(shortcutIds);
  const openLocalConversation = (): void => {
    remoteHosts().close();
    onOpenConversation?.();
  };
  const openConversationRef = useRef(openLocalConversation);
  shortcutIdsRef.current = shortcutIds;
  openConversationRef.current = openLocalConversation;
  const navigationIdsRef = useRef<readonly string[]>([]);
  navigationIdsRef.current = [...railPinnedChannels, ...railChannels].map((channel) => channel.id);
  const dragActiveRef = useRef(false);
  const launcher = quickSwitcherSettings?.launcher;
  const rosterMount = useMountedResource<HTMLDivElement>(() => {
    const acceptDrag = (event: DragEvent): void => {
      if (!dragActiveRef.current) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    };
    const acceptDrop = (event: DragEvent): void => {
      if (dragActiveRef.current) event.preventDefault();
    };
    const onHintDown = (event: KeyboardEvent): void => {
      if (event.altKey && !event.getModifierState('AltGraph')) setShowShortcutHints(true);
    };
    const onHintUp = (event: KeyboardEvent): void => {
      if (!event.altKey || event.getModifierState('AltGraph')) setShowShortcutHints(false);
    };
    const clearHints = (): void => setShowShortcutHints(false);
    const onVisibilityChange = (): void => {
      if (document.hidden) clearHints();
    };
    const onSelectionEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (webShortcutBlocked(event.target, document)) return;
      if (document.querySelector('[role="menu"]') !== null) return;
      setChannelSelection((current) =>
        current.ids.length === 0 ? current : { ids: [], anchorId: undefined },
      );
    };
    const onChannelShortcut = (event: KeyboardEvent): void => {
      const index = webChannelShortcutIndex(event.code, {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        altGraph: event.getModifierState('AltGraph'),
        composing: event.isComposing,
        repeat: event.repeat,
        prevented: event.defaultPrevented,
      });
      if (index === undefined) return;
      if (webShortcutBlocked(event.target, document)) return;
      const id = shortcutIdsRef.current[index];
      if (id === undefined) return;
      const channel = store.getSnapshot().channels.find((candidate) => candidate.id === id);
      if (channel === undefined) return;
      event.preventDefault();
      openConversationRef.current?.();
      void (channel.botSlug === undefined
        ? actions.openChannel(id)
        : actions.openBot(channel.botSlug));
    };
    const onConversationStep = (event: KeyboardEvent): void => {
      const action = (
        ['conversation-prev', 'conversation-next', 'unread-prev', 'unread-next'] as const
      ).find((candidate) => shortcutBindings.matches(candidate, event));
      const step =
        action === undefined
          ? undefined
          : {
              direction: action.endsWith('-prev') ? (-1 as const) : (1 as const),
              unreadOnly: action.startsWith('unread-'),
            };
      if (step === undefined || webModalOpen(document)) return;
      if (document.querySelector('[role="menu"]') !== null) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[aria-expanded="true"]') !== null
      )
        return;
      const snapshot = store.getSnapshot();
      const selection = snapshot.selection;
      const currentId =
        selection?.kind === 'channel'
          ? selection.channelId
          : selection?.kind === 'bot'
            ? snapshot.channels.find(
                (channel) => channel.type === 'dm' && channel.botSlug === selection.slug,
              )?.id
            : undefined;
      const unread = snapshot.activityList.channelUnread;
      const id = steppedConversationId(
        navigationIdsRef.current,
        currentId,
        step.direction,
        step.unreadOnly
          ? (candidate) =>
              (unread[candidate] ?? 0) > 0 && !snapshot.roster.muted.includes(candidate)
          : undefined,
      );
      const channel = snapshot.channels.find((candidate) => candidate.id === id);
      if (channel === undefined) return;
      event.preventDefault();
      openConversationRef.current?.();
      void (channel.botSlug === undefined
        ? actions.openChannel(channel.id)
        : actions.openBot(channel.botSlug));
    };
    document.addEventListener('keydown', onHintDown);
    document.addEventListener('keyup', onHintUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearHints);
    document.addEventListener('keydown', onSelectionEscape);
    const onQuickSwitcher = (event: KeyboardEvent): void => {
      if (!shortcutBindings.matches('quick-switcher', event)) {
        return;
      }
      if (webQuickSwitcherBlocked(event.target, document)) return;
      event.preventDefault();
      setShowShortcutHints(false);
      setQuickSwitcherSource('shortcut');
      actions.telemetryEvent('search:switcher_open', { source: 'shortcut' });
    };
    const stopLauncher = launcher?.subscribe((source) => {
      if (webQuickSwitcherBlocked(null, document)) return false;
      setShowShortcutHints(false);
      setQuickSwitcherSource(source);
      actions.telemetryEvent('search:switcher_open', { source });
      return true;
    });
    document.addEventListener('keydown', onChannelShortcut);
    document.addEventListener('keydown', onConversationStep);
    document.addEventListener('keydown', onQuickSwitcher);
    document.addEventListener('dragover', acceptDrag);
    document.addEventListener('drop', acceptDrop);
    return () => {
      document.removeEventListener('keydown', onHintDown);
      document.removeEventListener('keyup', onHintUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearHints);
      document.removeEventListener('keydown', onSelectionEscape);
      document.removeEventListener('keydown', onChannelShortcut);
      document.removeEventListener('keydown', onConversationStep);
      document.removeEventListener('keydown', onQuickSwitcher);
      stopLauncher?.();
      document.removeEventListener('dragover', acceptDrag);
      document.removeEventListener('drop', acceptDrop);
      if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    };
  }, [actions, shortcutBindings, launcher]);
  const shortcutFor = (channelId: string): string | undefined =>
    webChannelShortcutLabel(shortcutIds.indexOf(channelId));
  const activateChannel = (
    channel: ChannelSummary,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const gesture: ChannelSelectionGesture = event.shiftKey
      ? 'range'
      : event.ctrlKey || event.metaKey
        ? 'toggle'
        : 'plain';
    setChannelSelection((current) =>
      selectChannels(
        reconcileChannelSelection(current, visibleChannelIds),
        visibleChannelIds,
        channel.id,
        gesture,
      ),
    );
    if (gesture !== 'plain') return;
    openLocalConversation();
    void (channel.botSlug === undefined
      ? actions.openChannel(channel.id)
      : actions.openBot(channel.botSlug));
  };

  const openQuickSwitcherEntry = (
    { channel }: Pick<QuickSwitcherEntry, 'channel'>,
    then?: () => Promise<void>,
  ): void => {
    setQuickSwitcherSource(undefined);
    openLocalConversation();
    setChannelSelection((current) =>
      selectChannels(
        reconcileChannelSelection(current, visibleChannelIds),
        visibleChannelIds,
        channel.id,
        'plain',
      ),
    );
    void (
      channel.botSlug === undefined
        ? actions.openChannel(channel.id)
        : actions.openBot(channel.botSlug)
    ).then(then);
  };

  const openQuickSwitcherMessage = ({ channelId, message }: MessageSearchHit): void => {
    const channel = state.channels.find((item) => item.id === channelId);
    if (channel === undefined) return;
    actions.telemetryEvent('search:result_open', { kind: 'message' });
    openQuickSwitcherEntry({ channel }, () => actions.openAround(channelId, message.id));
  };
  return {
    rosterMount,
    shortcutFor,
    openLocalConversation,
    dragActiveRef,
    activateChannel,
    openQuickSwitcherEntry,
    openQuickSwitcherMessage,
  };
}

export function renderQuickSwitcher({
  quickSwitcherSource,
  state,
  rosterHiddenIds,
  quickSwitcherSettings,
  setQuickSwitcherSource,
  actions,
  openQuickSwitcherMessage,
  botBySlug,
  shortcutBindings,
  t,
  openQuickSwitcherEntry,
}: {
  quickSwitcherSource: QuickSwitcherSource | undefined;
  state: SidebarState;
  rosterHiddenIds: string[];
  quickSwitcherSettings: QuickSwitcherSettings | undefined;
  setQuickSwitcherSource: Dispatch<SetStateAction<QuickSwitcherSource | undefined>>;
  actions: BridgeActions;
  openQuickSwitcherMessage: ({ channelId, message }: MessageSearchHit) => void;
  botBySlug: ReadonlyMap<string, BotSummary>;
  shortcutBindings: ShortcutBindings;
  t: BotHarnessTranslate;
  openQuickSwitcherEntry: (
    { channel }: Pick<QuickSwitcherEntry, 'channel'>,
    then?: (() => Promise<void>) | undefined,
  ) => void;
}) {
  return quickSwitcherSource !== undefined ? (
    <QuickSwitcher
      source={quickSwitcherSource}
      entries={quickSwitcherEntries(state.channels, state.bots, rosterHiddenIds)}
      settings={
        quickSwitcherSettings === undefined
          ? undefined
          : {
              search: quickSwitcherSettings.search,
              open: (result) => {
                setQuickSwitcherSource(undefined);
                actions.telemetryEvent('search:result_open', {
                  kind: 'setting',
                });
                quickSwitcherSettings.open(result);
              },
            }
      }
      messages={
        actions.searchMessages === undefined
          ? undefined
          : {
              search: actions.searchMessages,
              open: openQuickSwitcherMessage,
            }
      }
      bots={botBySlug}
      activityOf={(bot) => personaBotActivity(state, bot)}
      shortcutBindings={shortcutBindings}
      t={t}
      onOpen={(entry) => {
        actions.telemetryEvent('search:result_open', { kind: 'channel' });
        openQuickSwitcherEntry(entry);
      }}
      onClose={() => setQuickSwitcherSource(undefined)}
    />
  ) : null;
}

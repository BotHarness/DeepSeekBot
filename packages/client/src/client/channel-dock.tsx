import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

import * as stylex from '@stylexjs/stylex';
import { Menu, Tooltip, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';

import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import {
  allowsDockDrop,
  CHANNEL_BODY_COMPONENT,
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_QUERY,
  CHANNEL_ENTRY_COMPONENT,
  clearChannelDock,
  DEFAULT_DOCK_PANELS,
  pruneChannelDock,
  readChannelDock,
  resolveDockPosition,
  writeChannelDock,
  type ChannelDockStorage,
  type DockPosition,
} from './channel-dock-layout.js';
import { NARROW_CHANNEL_SIDEBAR_QUERY } from './channel-sidebar-layout.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { clampChannelSidebarWidth, channelSidebarPrefs } from './channel-sidebar-prefs.js';
import { sidebarStyles } from './channel-sidebar-styles.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { IconButton } from './ds/icon-button.js';
import { PanelHeader } from './ds/panel-header.js';
import { space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    overflow: 'auto',
    paddingTop: space.x1,
    paddingInline: space.x4,
    paddingBottom: space.x4,
  },
  panel: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  actions: { display: 'inline-flex', alignItems: 'center', gap: space.x1 },
});

const DOCK_THEME: DockviewTheme = {
  name: 'botharness',
  className: 'bh-dock-theme',
  gap: 0,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'content',
};

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function subscribeQueries(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const queries = [CHANNEL_DOCK_QUERY, NARROW_CHANNEL_SIDEBAR_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}

export function useChannelDockActive(): boolean {
  return useSyncExternalStore(
    subscribeQueries,
    () => matches(CHANNEL_DOCK_QUERY) && !matches(NARROW_CHANNEL_SIDEBAR_QUERY),
    () => false,
  );
}

interface EntryRuntime {
  refreshRevision: number;
  expandable: boolean;
}

interface DockContextValue {
  body: ReactNode;
  menu: ReactNode;
  entries: ReadonlyMap<string, ChannelSidebarEntry>;
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  runtime(entryId: string): EntryRuntime;
  setRuntime(entryId: string, next: Partial<EntryRuntime>): void;
  close(panelId: string): void;
  t: BotHarnessTranslate;
}

const DockContext = createContext<DockContextValue | undefined>(undefined);

function useDock(): DockContextValue {
  const value = useContext(DockContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

function useEntryProps(entryId: string): ChannelSidebarEntryProps | undefined {
  const dock = useDock();
  const runtime = dock.runtime(entryId);
  if (dock.entryProps === undefined) return undefined;
  return {
    ...dock.entryProps,
    refreshRevision: runtime.refreshRevision,
    requestRefresh: () =>
      dock.setRuntime(entryId, { refreshRevision: dock.runtime(entryId).refreshRevision + 1 }),
    expanded: runtime.expandable,
    setExpanded: () => {},
    setExpandable: (expandable) => dock.setRuntime(entryId, { expandable }),
  };
}

function ChannelBodyPanel(): ReactElement {
  const dock = useDock();
  return (
    <div className="bh-dock-body">
      {dock.body}
      {dock.menu}
    </div>
  );
}

function ChannelEntryPanel({ params }: IDockviewPanelProps<{ entryId: string }>): ReactElement {
  const dock = useDock();
  const entry = dock.entries.get(params.entryId);
  const props = useEntryProps(params.entryId);
  const shown = entry !== undefined && props !== undefined && dock.shows(entry);
  return (
    <section data-sidebar-entry={params.entryId} {...stylex.props(styles.panel)}>
      {shown ? (
        props.expanded ? (
          <div data-sidebar-entry-body="" {...stylex.props(styles.body)}>
            <entry.component {...props} />
          </div>
        ) : null
      ) : (
        <p data-dock-empty="" {...stylex.props(sidebarStyles.empty)}>
          {dock.t('dock.empty')}
        </p>
      )}
    </section>
  );
}

function ChannelDockTab({ api, params }: IDockviewPanelHeaderProps<{ entryId?: string }>) {
  const dock = useDock();
  const entryId = params.entryId;
  const entry = entryId === undefined ? undefined : dock.entries.get(entryId);
  const props = useEntryProps(entryId ?? '');
  if (entryId === undefined || entry === undefined) return null;
  const shown = props !== undefined && dock.shows(entry);
  const Badge = shown ? entry.badge : undefined;
  const HeaderAction = shown ? entry.headerAction : undefined;
  const HeaderTabs = shown ? entry.headerTabs : undefined;
  const closeLabel = dock.t('dock.close', { label: entry.label });
  return (
    <div className="bh-dock-header" data-dock-header={entryId}>
      <PanelHeader
        icon={<ChannelSidebarIcon name={entry.icon} />}
        label={HeaderTabs === undefined ? entry.label : (entry.headerLabel ?? entry.label)}
        badge={Badge === undefined || props === undefined ? undefined : <Badge {...props} />}
        tabs={
          HeaderTabs === undefined || props === undefined ? undefined : <HeaderTabs {...props} />
        }
        action={
          <span
            {...stylex.props(styles.actions)}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {HeaderAction === undefined || props === undefined ? null : <HeaderAction {...props} />}
            <Tooltip label={closeLabel} side="bottom" delayMs={500}>
              <IconButton
                tone="subtle"
                aria-label={closeLabel}
                data-dock-close={entryId}
                onClick={() => dock.close(api.id)}
              >
                <ChannelSidebarIcon name="x" />
              </IconButton>
            </Tooltip>
          </span>
        }
      />
    </div>
  );
}

const COMPONENTS = {
  [CHANNEL_BODY_COMPONENT]: ChannelBodyPanel,
  [CHANNEL_ENTRY_COMPONENT]: ChannelEntryPanel,
};

function hideBodyHeader(api: DockviewApi): void {
  const group = api.getPanel(CHANNEL_BODY_PANEL)?.group;
  if (group !== undefined && !group.header.hidden) group.header.hidden = true;
}

function addEntryPanel(
  api: DockviewApi,
  entry: ChannelSidebarEntry,
  remembered: DockPosition | undefined,
): void {
  if (api.getPanel(entry.id) !== undefined) return;
  api.addPanel({
    id: entry.id,
    component: CHANNEL_ENTRY_COMPONENT,
    title: entry.label,
    params: { entryId: entry.id },
    position: resolveDockPosition(api, remembered),
  });
}

function buildDefaultLayout(api: DockviewApi, entries: ReadonlyMap<string, ChannelSidebarEntry>) {
  api.clear();
  api.addPanel({
    id: CHANNEL_BODY_PANEL,
    component: CHANNEL_BODY_COMPONENT,
    title: CHANNEL_BODY_PANEL,
  });
  let previous: string | undefined;
  for (const id of DEFAULT_DOCK_PANELS) {
    const entry = entries.get(id);
    if (entry === undefined) continue;
    api.addPanel({
      id,
      component: CHANNEL_ENTRY_COMPONENT,
      title: entry.label,
      params: { entryId: id },
      position:
        previous === undefined
          ? { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' }
          : { referencePanel: previous, direction: 'below' },
    });
    previous ??= id;
  }
  const column = previous === undefined ? undefined : api.getPanel(previous)?.group;
  column?.api.setSize({
    width: clampChannelSidebarWidth(channelSidebarPrefs.getSnapshot().width),
  });
  hideBodyHeader(api);
}

export interface ChannelDockProps {
  body: ReactNode;
  entries: readonly ChannelSidebarEntry[];
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  t: BotHarnessTranslate;
  storage?: ChannelDockStorage | undefined;
}

export function ChannelDock({
  body,
  entries,
  entryProps,
  shows,
  t,
  storage,
}: ChannelDockProps): ReactElement {
  const [api, setApi] = useState<DockviewApi>();
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [runtimes, setRuntimes] = useState<ReadonlyMap<string, EntryRuntime>>(new Map());
  const parked = useRef<Record<string, DockPosition & { missing?: boolean }>>({});
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const known = useRef(byId);
  known.current = byId;

  const save = (target: DockviewApi): void => {
    hideBodyHeader(target);
    setOpenIds(target.panels.map((panel) => panel.id));
    writeChannelDock({ layout: target.toJSON(), parked: parked.current }, storage);
  };

  const positionOf = (target: DockviewApi, panelId: string): DockPosition | undefined =>
    pruneChannelDock(target.toJSON(), (id) => id !== panelId).parked[panelId];

  const onReady = ({ api: ready }: DockviewReadyEvent): void => {
    const stored = readChannelDock(storage);
    parked.current = { ...stored?.parked };
    let restored = false;
    if (stored !== undefined) {
      const pruned = pruneChannelDock(
        stored.layout,
        (id) => id === CHANNEL_BODY_PANEL || known.current.has(id),
      );
      for (const [id, position] of Object.entries(pruned.parked))
        parked.current[id] = { ...position, missing: true };
      if (pruned.layout !== undefined) {
        try {
          ready.fromJSON(pruned.layout);
          restored = ready.getPanel(CHANNEL_BODY_PANEL) !== undefined;
        } catch {
          restored = false;
        }
      }
    }
    if (!restored) buildDefaultLayout(ready, known.current);
    ready.onWillShowOverlay((event) => {
      if (!allowsDockDrop(event.kind, event.position)) event.preventDefault();
    });
    ready.onWillDrop((event) => {
      if (!allowsDockDrop(event.kind, event.position)) event.preventDefault();
    });
    ready.onDidLayoutChange(() => save(ready));
    save(ready);
    setApi(ready);
  };

  const registryMount = useMountedResource<HTMLDivElement>(() => {
    if (api === undefined) return;
    for (const panel of [...api.panels]) {
      if (panel.id === CHANNEL_BODY_PANEL || byId.has(panel.id)) continue;
      const position = positionOf(api, panel.id);
      parked.current[panel.id] = { ...(position ?? { direction: 'right' }), missing: true };
      panel.api.close();
    }
    for (const [id, position] of Object.entries(parked.current)) {
      const entry = byId.get(id);
      if (position.missing !== true || entry === undefined) continue;
      delete parked.current[id];
      addEntryPanel(api, entry, position);
    }
    save(api);
  }, [api, byId]);

  const close = (panelId: string): void => {
    const panel = api?.getPanel(panelId);
    if (api === undefined || panel === undefined || panelId === CHANNEL_BODY_PANEL) return;
    const position = positionOf(api, panelId);
    if (position !== undefined) parked.current[panelId] = position;
    panel.api.close();
  };

  const menu = (
    <ChannelDockPanelsMenu
      entries={entries}
      openIds={openIds}
      t={t}
      onToggle={(id) => {
        if (api === undefined) return;
        if (api.getPanel(id) !== undefined) {
          close(id);
          return;
        }
        const entry = byId.get(id);
        if (entry === undefined) return;
        const remembered = parked.current[id];
        delete parked.current[id];
        addEntryPanel(api, entry, remembered);
      }}
      onReset={() => {
        if (api === undefined) return;
        clearChannelDock(storage);
        parked.current = {};
        buildDefaultLayout(api, byId);
        save(api);
      }}
    />
  );

  const value: DockContextValue = {
    body,
    menu,
    entries: byId,
    entryProps,
    shows,
    runtime: (entryId) => runtimes.get(entryId) ?? { refreshRevision: 0, expandable: true },
    setRuntime: (entryId, next) =>
      setRuntimes((current) => {
        const updated = new Map(current);
        updated.set(entryId, {
          ...(current.get(entryId) ?? { refreshRevision: 0, expandable: true }),
          ...next,
        });
        return updated;
      }),
    close,
    t,
  };

  return (
    <DockContext.Provider value={value}>
      <div
        ref={registryMount}
        className="bh-dock"
        data-bh-tour="channel-sidebar"
        role="region"
        aria-label={t('dock.region')}
      >
        <DockviewReact
          components={COMPONENTS}
          defaultTabComponent={ChannelDockTab}
          singleTabMode="fullwidth"
          disableTabsOverflowList
          disableFloatingGroups
          theme={DOCK_THEME}
          dndEdges={{
            size: { value: 24, type: 'pixels' },
            activationSize: { value: 8, type: 'percentage' },
          }}
          onReady={onReady}
        />
      </div>
    </DockContext.Provider>
  );
}

const RESET_ID = 'bh:dock-reset';

function ChannelDockPanelsMenu({
  entries,
  openIds,
  t,
  onToggle,
  onReset,
}: {
  entries: readonly ChannelSidebarEntry[];
  openIds: readonly string[];
  t: BotHarnessTranslate;
  onToggle(id: string): void;
  onReset(): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const label = t('dock.panels');
  const items: MenuEntry[] = [
    { type: 'label', id: 'bh:dock-panels', text: label },
    ...entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      icon: <ChannelSidebarIcon name={entry.icon} />,
    })),
    { type: 'separator', id: 'bh:dock-separator' },
    { id: RESET_ID, label: t('dock.reset') },
  ];
  return (
    <span className="bh-dock-menu" data-dock-menu="">
      <Menu
        open={open}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={label} side="bottom" delayMs={500}>
            <IconButton
              tone="subtle"
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <ChannelSidebarIcon name="panels-top-left" />
            </IconButton>
          </Tooltip>
        }
        items={items}
        selectedIds={openIds}
        onSelect={(id) => {
          setOpen(false);
          if (id === RESET_ID) onReset();
          else onToggle(id);
        }}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}

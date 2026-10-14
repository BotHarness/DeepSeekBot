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
import type { DockPanelChannel, DockPanelHost, DockPanelRegistration } from './dock-panels.js';
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
  resolveDefaultPosition,
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
  panels: ReadonlyMap<string, DockPanelRegistration>;
  channel: DockPanelChannel | undefined;
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

function DockPanelBody({ panel }: { panel: DockPanelRegistration }): ReactElement {
  const dock = useDock();
  const channel = panel.scope === 'channel' ? dock.channel : undefined;
  return (
    <section data-dock-panel={panel.id} {...stylex.props(styles.panel)}>
      {panel.scope === 'global' || channel !== undefined ? (
        <div data-dock-panel-body="" {...stylex.props(styles.body)}>
          <panel.component channel={channel} />
        </div>
      ) : (
        <p data-dock-empty="" {...stylex.props(sidebarStyles.empty)}>
          {dock.t('dock.empty')}
        </p>
      )}
    </section>
  );
}

function ChannelEntryPanel({ params }: IDockviewPanelProps<{ entryId: string }>): ReactElement {
  const dock = useDock();
  const panel = dock.panels.get(params.entryId);
  const entry = panel?.entry;
  const props = useEntryProps(params.entryId);
  if (panel !== undefined && entry === undefined) return <DockPanelBody panel={panel} />;
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
  const panel = entryId === undefined ? undefined : dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId ?? '');
  if (entryId === undefined || panel === undefined) return null;
  const shown = entry !== undefined && props !== undefined && dock.shows(entry);
  const Badge = shown ? entry.badge : undefined;
  const HeaderAction = shown ? entry.headerAction : undefined;
  const HeaderTabs = shown ? entry.headerTabs : undefined;
  const closeLabel = dock.t('dock.close', { label: panel.title });
  return (
    <div className="bh-dock-header" data-dock-header={entryId}>
      <PanelHeader
        icon={<ChannelSidebarIcon name={panel.icon} />}
        label={HeaderTabs === undefined ? panel.title : (entry?.headerLabel ?? panel.title)}
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
  panel: DockPanelRegistration,
  remembered: DockPosition | undefined,
): void {
  if (api.getPanel(panel.id) !== undefined) return;
  api.addPanel({
    id: panel.id,
    component: CHANNEL_ENTRY_COMPONENT,
    title: panel.title,
    params: { entryId: panel.id },
    position:
      remembered === undefined
        ? resolveDefaultPosition(api, panel.defaultPosition)
        : resolveDockPosition(api, remembered),
  });
}

function buildDefaultLayout(api: DockviewApi, entries: ReadonlyMap<string, DockPanelRegistration>) {
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
      title: entry.title,
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
  panels: readonly DockPanelRegistration[];
  channel?: DockPanelChannel | undefined;
  registry?: DockPanelHost | undefined;
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  t: BotHarnessTranslate;
  storage?: ChannelDockStorage | undefined;
}

export function ChannelDock({
  body,
  panels,
  channel,
  registry,
  entryProps,
  shows,
  t,
  storage,
}: ChannelDockProps): ReactElement {
  const [api, setApi] = useState<DockviewApi>();
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [runtimes, setRuntimes] = useState<ReadonlyMap<string, EntryRuntime>>(new Map());
  const parked = useRef<Record<string, DockPosition & { missing?: boolean }>>({});
  const byId = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const known = useRef(byId);
  known.current = byId;

  const save = (target: DockviewApi): void => {
    hideBodyHeader(target);
    const ids = target.panels.map((panel) => panel.id);
    setOpenIds(ids);
    registry?.reportOpen(ids.filter((id) => id !== CHANNEL_BODY_PANEL));
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
      const panel = byId.get(id);
      if (position.missing !== true || panel === undefined) continue;
      delete parked.current[id];
      addEntryPanel(api, panel, position);
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

  const open = (panelId: string): void => {
    const panel = byId.get(panelId);
    if (api === undefined || panel === undefined) return;
    if (api.getPanel(panelId) !== undefined) {
      api.getPanel(panelId)?.api.setActive();
      return;
    }
    const remembered = parked.current[panelId];
    delete parked.current[panelId];
    addEntryPanel(api, panel, remembered);
  };

  const layout = useRef({ open, close });
  layout.current = { open, close };
  const layoutMount = useMountedResource<HTMLSpanElement>(() => {
    if (api === undefined || registry === undefined) return;
    return registry.attach({
      open: (id) => layout.current.open(id),
      close: (id) => layout.current.close(id),
    });
  }, [api, registry]);

  const menu = (
    <ChannelDockPanelsMenu
      panels={panels}
      openIds={openIds}
      t={t}
      onToggle={(id) => (api?.getPanel(id) === undefined ? open(id) : close(id))}
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
    panels: byId,
    channel,
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
        <span ref={layoutMount} hidden />
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

const groupRank = (panel: DockPanelRegistration): number =>
  panel.entry?.scope === 'channel' ? 1 : 0;

function ChannelDockPanelsMenu({
  panels,
  openIds,
  t,
  onToggle,
  onReset,
}: {
  panels: readonly DockPanelRegistration[];
  openIds: readonly string[];
  t: BotHarnessTranslate;
  onToggle(id: string): void;
  onReset(): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const label = t('dock.panels');
  const items: MenuEntry[] = [
    { type: 'label', id: 'bh:dock-panels', text: label },
    ...[...panels]
      .sort((left, right) => groupRank(left) - groupRank(right))
      .map((panel) => ({
        id: panel.id,
        label: panel.title,
        icon: <ChannelSidebarIcon name={panel.icon} />,
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

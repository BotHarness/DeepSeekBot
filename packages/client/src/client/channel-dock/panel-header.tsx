import { AppearanceContext } from '../appearance-context.js';
import { PanelAppearanceSettings } from '../appearance-panel-settings.js';
import { panelTargetId } from '../appearance-panels.js';
import { MESSAGE_LEAF, moveChannelSplit } from '../channel-split-layout.js';
import { PanelVisibilityLabel } from '../panel-menu.js';
import { usePanelMenu } from '../panel-menu.js';
import { WORKSPACE_CHANNELS } from '../workspace-context.js';
import { useContext, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '../ds/tooltip.js';
import { type IDockviewPanelHeaderProps } from 'dockview-react';
import { CHANNEL_BODY_PANEL, type DockPosition } from '../channel-dock-layout.js';
import { IconButton } from '../ds/icon-button.js';
import { PanelHeader } from '../ds/panel-header.js';
import { EntryPart } from '../entry-part.js';
import { styles } from './dock-styles.js';
import {
  ChannelSidebarIcon,
  ChannelHeaderActions,
  ChannelBreadcrumb,
  useDock,
  entryScopeKey,
  useEntryProps,
  workspaceState,
} from './dock-context.js';
import { columnEntries, SubpanelControl } from './subpanel-column.js';
import { scopePanelPart } from './entry-panel.js';

export function ChannelDockTab({ api, params }: IDockviewPanelHeaderProps<{ entryId?: string }>) {
  return <DockPanelHeader entryId={params.entryId} panelId={api.id} />;
}

export function DockPanelHeader({
  entryId,
  panelId,
}: {
  entryId: string | undefined;
  panelId: string;
}) {
  const appearance = useContext(AppearanceContext);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const dock = useDock();
  const panel = entryId === undefined ? undefined : dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId ?? '');
  const contextMenu = usePanelMenu({
    items: panel
      ? [
          ...(appearance
            ? [
                { id: 'appearance', label: dock.t('appearance.panelMenu') },
                { type: 'separator' as const, id: 'appearance-separator' },
              ]
            : []),
          ...(dock.simple
            ? []
            : [
                {
                  id: 'close',
                  label: dock.t('dock.close', { label: panel.title }),
                  icon: <ChannelSidebarIcon name="x" />,
                },
              ]),
          ...(entryId === CHANNEL_BODY_PANEL && dock.column && dock.channel
            ? [
                { type: 'separator' as const, id: 'channel-controls-separator' },
                {
                  type: 'label' as const,
                  id: 'channel-controls',
                  text: dock.t('workspace.channelPanels'),
                },
                ...columnEntries(dock).map((child) => ({
                  id: `column:${child.id}`,
                  icon: <ChannelSidebarIcon name={child.icon} />,
                  label: (
                    <PanelVisibilityLabel
                      label={child.label}
                      checked={!dock.column!.state.hidden.includes(child.id)}
                      t={dock.t}
                    />
                  ),
                })),
              ]
            : []),
          ...(entryId === CHANNEL_BODY_PANEL &&
          !dock.column &&
          dock.channel &&
          dock.sessionWorkspace
            ? [
                { type: 'separator' as const, id: 'channel-controls-separator' },
                {
                  type: 'label' as const,
                  id: 'channel-controls',
                  text: dock.t('workspace.channelPanels'),
                },
                ...dock.channelPanelIds.flatMap((id) => {
                  const state = workspaceState(dock, id);
                  const child = dock.panels.get(id);
                  if (
                    !state ||
                    !child ||
                    (id !== 'sessions' && (dock.channel?.type !== 'dm' || !dock.channel.botSlug))
                  )
                    return [];
                  return [
                    {
                      id: `control:${id}`,
                      icon: <ChannelSidebarIcon name={child.icon} />,
                      label: (
                        <PanelVisibilityLabel
                          label={child.title}
                          checked={!state.state.hiddenControl}
                          t={dock.t}
                        />
                      ),
                    },
                  ];
                }),
              ]
            : []),
          ...(entryId && workspaceState(dock, entryId)
            ? (['left', 'right', 'above', 'below'] as const).map((direction) => ({
                id: direction,
                label: dock.t(`workspace.session.${direction}`),
              }))
            : []),
        ]
      : [],
    onSelect: (id) => {
      if (id === 'appearance') setAppearanceOpen(true);
      else if (id === 'close') dock.close(panelId);
      else if (id.startsWith('column:')) {
        const child = id.slice('column:'.length);
        dock.column?.setHidden(child, !dock.column.state.hidden.includes(child));
      } else if (id.startsWith('control:')) {
        const child = workspaceState(dock, id.slice('control:'.length));
        if (child)
          child.setState({
            ...child.state,
            hiddenControl: !child.state.hiddenControl,
            open: child.state.hiddenControl ? child.state.open : false,
          });
      } else {
        const child = workspaceState(dock, entryId ?? '');
        if (child)
          dock.childLayout.setTree(
            moveChannelSplit(
              dock.childLayout.tree,
              entryId!,
              MESSAGE_LEAF,
              id as DockPosition['direction'],
            ),
          );
      }
    },
  });
  if (entryId === undefined || panel === undefined) return null;
  const shown = entry !== undefined && props !== undefined && dock.visible.has(entryId);
  const Badge = shown ? entry.badge : undefined;
  const HeaderAction = shown ? entry.headerAction : undefined;
  const HeaderTabs = shown ? entry.headerTabs : undefined;
  const PanelAction =
    panel.scope === 'global' || dock.channel !== undefined ? panel.headerAction : undefined;
  const closeLabel = dock.t('dock.close', { label: panel.title });
  return (
    <>
      {appearanceOpen && appearance && (
        <PanelAppearanceSettings
          owner={appearance}
          id={panelTargetId(entryId)}
          label={panel.title}
          t={dock.t}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
      <div
        className="bh-dock-header"
        data-dock-header={entryId}
        data-window-drag
        onMouseDown={(event) => {
          if (!(event.target as Element).closest('[data-panel-hide]')) event.stopPropagation();
        }}
        {...contextMenu.triggerProps}
      >
        {contextMenu.menu}
        <PanelHeader
          {...(dock.simple ? {} : { onHide: () => dock.close(panelId) })}
          hideLabel={closeLabel}
          hideHint={dock.t('dock.headHint')}
          icon={<ChannelSidebarIcon name={panel.icon} />}
          label={HeaderTabs === undefined ? panel.title : (entry?.headerLabel ?? panel.title)}
          context={
            entryId === CHANNEL_BODY_PANEL && dock.hasHeader ? <ChannelBreadcrumb /> : undefined
          }
          badge={
            Badge === undefined || props === undefined
              ? undefined
              : dock.conversation(
                  <EntryPart key={entryScopeKey(props)} part={Badge} props={props} />,
                )
          }
          tabs={
            HeaderTabs === undefined || props === undefined
              ? undefined
              : dock.conversation(<HeaderTabs key={entryScopeKey(props)} {...props} />)
          }
          action={
            <span
              data-dock-actions=""
              {...stylex.props(styles.actions)}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {entryId === CHANNEL_BODY_PANEL && dock.hasHeader && <ChannelHeaderActions />}
              {HeaderAction === undefined || props === undefined
                ? null
                : dock.conversation(
                    <EntryPart key={entryScopeKey(props)} part={HeaderAction} props={props} />,
                  )}
              {PanelAction &&
                scopePanelPart(
                  dock,
                  panel,
                  <PanelAction
                    key={panel.scope === 'channel' ? dock.channel?.id : undefined}
                    channel={panel.scope === 'channel' ? dock.channel : undefined}
                  />,
                )}
              {entryId === WORKSPACE_CHANNELS && (
                <span className="bh-workspace-channel-actions" ref={dock.setChannelsHeader} />
              )}
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channelPanelIds.map((id) =>
                  workspaceState(dock, id) &&
                  dock.panels.has(id) &&
                  (id === 'sessions' || (dock.channel?.type === 'dm' && !!dock.channel.botSlug)) ? (
                    <SubpanelControl key={id} id={id} />
                  ) : null,
                )}
              {entryId === CHANNEL_BODY_PANEL && !dock.column && dock.channel && dock.files && (
                <Tooltip label={dock.t('generatedFiles.title')} side="bottom" portal delayMs={500}>
                  <IconButton
                    aria-label={dock.t('generatedFiles.title')}
                    aria-expanded={dock.files.open}
                    onClick={() => {
                      if (!dock.files?.open) {
                        dock.members?.setOpen(false);
                        dock.inbox?.setOpen(false);
                      }
                      dock.files?.setOpen(!dock.files.open);
                    }}
                  >
                    <ChannelSidebarIcon name="file" />
                  </IconButton>
                </Tooltip>
              )}
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channel?.type === 'dm' &&
                dock.inbox && (
                  <Tooltip label={dock.t('entry.botInbox')} side="bottom" portal delayMs={500}>
                    <IconButton
                      aria-label={dock.t('entry.botInbox')}
                      aria-expanded={dock.inbox.open}
                      onClick={() => {
                        if (!dock.inbox?.open) dock.files?.setOpen(false);
                        dock.inbox?.setOpen(!dock.inbox.open);
                      }}
                    >
                      <ChannelSidebarIcon name="inbox" />
                    </IconButton>
                  </Tooltip>
                )}
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channel?.type === 'group' &&
                dock.members && (
                  <Tooltip label={dock.t('entry.members')} side="bottom" portal delayMs={500}>
                    <IconButton
                      aria-label={dock.t('entry.members')}
                      aria-pressed={dock.members.open}
                      onClick={() => dock.members?.setOpen(!dock.members.open)}
                    >
                      <ChannelSidebarIcon name="users" />
                    </IconButton>
                  </Tooltip>
                )}
              {entryId === CHANNEL_BODY_PANEL && dock.column && (
                <Tooltip
                  label={dock.t('workspace.subpanelColumn')}
                  side="bottom"
                  portal
                  delayMs={500}
                >
                  <IconButton
                    aria-label={dock.t('workspace.subpanelColumn')}
                    aria-pressed={dock.column.state.open}
                    data-subpanel-column-toggle=""
                    disabled={!dock.channel}
                    onClick={() => dock.column?.setOpen(!dock.column.state.open)}
                  >
                    <ChannelSidebarIcon name="panel-right" />
                  </IconButton>
                </Tooltip>
              )}
              {!dock.railed && (
                <Tooltip label={closeLabel} side="bottom" portal delayMs={500}>
                  <IconButton
                    tone="subtle"
                    aria-label={closeLabel}
                    data-dock-close={entryId}
                    onClick={() => dock.close(panelId)}
                  >
                    <ChannelSidebarIcon name="x" />
                  </IconButton>
                </Tooltip>
              )}
            </span>
          }
        />
      </div>
    </>
  );
}

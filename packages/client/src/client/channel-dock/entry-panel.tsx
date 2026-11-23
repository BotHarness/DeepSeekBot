import { PanelEmptyState } from '../ds/empty-state.js';
import { type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { type IDockviewPanelProps } from 'dockview-react';
import type { DockPanelRegistration } from '../dock-panels.js';
import { EntryPart } from '../entry-part.js';
import { styles } from './dock-styles.js';
import { type DockContextValue, useDock, entryScopeKey, useEntryProps } from './dock-context.js';

function DockPanelBody({ panel }: { panel: DockPanelRegistration }): ReactElement {
  const dock = useDock();
  const channel = panel.scope === 'channel' ? dock.channel : undefined;
  return (
    <section data-dock-panel={panel.id} {...stylex.props(styles.panel)}>
      {(panel.scope === 'global' || channel !== undefined) &&
      (panel.binding !== 'current-bot' || channel?.type === 'dm') ? (
        <div
          data-dock-panel-body=""
          {...stylex.props(styles.body, dock.railed && styles.workspaceBody)}
        >
          {panel.scope === 'channel' || panel.binding === 'current-bot' ? (
            dock.conversation(<panel.component key={channel?.id} channel={channel} />)
          ) : (
            <panel.component key={channel?.id} channel={channel} />
          )}
        </div>
      ) : (
        <PanelEmptyState icon={panel?.icon}>{dock.t('dock.empty')}</PanelEmptyState>
      )}
    </section>
  );
}

export function scopePanelPart(
  dock: DockContextValue,
  panel: DockPanelRegistration | undefined,
  node: ReactNode,
): ReactNode {
  return panel?.scope === 'channel' || panel?.binding === 'current-bot'
    ? dock.conversation(node)
    : node;
}

export function ChannelEntryPanel({
  params,
}: IDockviewPanelProps<{ entryId: string }>): ReactElement {
  return <ChannelEntryContent entryId={params.entryId} />;
}

export function ChannelEntryContent({ entryId }: { entryId: string }): ReactElement {
  const dock = useDock();
  const panel = dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId);
  if (panel !== undefined && entry === undefined) return <DockPanelBody panel={panel} />;
  const shown = entry !== undefined && props !== undefined && dock.visible.has(entryId);
  return (
    <section data-sidebar-entry={entryId} {...stylex.props(styles.panel)}>
      {shown ? (
        props.expanded ? (
          <div
            data-sidebar-entry-body=""
            {...stylex.props(
              styles.body,
              dock.railed && styles.workspaceBody,
              props.flush && styles.flushBody,
            )}
          >
            {dock.conversation(
              <EntryPart key={entryScopeKey(props)} part={entry.component} props={props} />,
            )}
          </div>
        ) : null
      ) : (
        <PanelEmptyState icon={panel?.icon}>{dock.t('dock.empty')}</PanelEmptyState>
      )}
    </section>
  );
}

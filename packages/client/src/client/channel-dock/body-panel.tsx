import { AppearancePanelHeader } from '../appearance-panel-header.js';
import { SessionHeaderSlot } from '../session-header-slot.js';
import { MESSAGE_LEAF } from '../channel-split-layout.js';
import { ChannelWorkspace } from '../channel-workspace.js';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from '../ds/tooltip.js';
import { IconButton } from '../ds/icon-button.js';
import { PanelHeader } from '../ds/panel-header.js';
import {
  ChannelSidebarIcon,
  DockBodySlot,
  DockFilesSlot,
  useDock,
  entryScopeKey,
  useEntryProps,
  workspaceState,
} from './dock-context.js';
import { SESSION_DETAIL, SessionDockHeader, SimpleMessageContent } from './subpanel-column.js';
import { ChannelEntryContent } from './entry-panel.js';
import { DockPanelHeader } from './panel-header.js';

export function ChannelBodyPanel(): ReactElement {
  const dock = useDock();
  const [sessionSlot, setSessionSlot] = useState<HTMLElement | null>(null);
  if (dock.column) return <>{dock.conversation(<SimpleMessageContent column={dock.column} />)}</>;
  const panels: Record<string, { label: string; header?: ReactNode; content: ReactNode }> = {
    [MESSAGE_LEAF]: { label: dock.t('workspace.messages'), content: <ChannelMessageContent /> },
  };
  for (const id of dock.channelPanelIds) {
    const state = workspaceState(dock, id);
    const panel = dock.panels.get(id);
    const available = id === 'sessions' || (dock.channel?.type === 'dm' && !!dock.channel.botSlug);
    if (state?.state.open && panel && available && dock.channel)
      panels[id] = {
        label: panel.title,
        header: <DockPanelHeader entryId={id} panelId={id} />,
        content: <ChannelEntryContent entryId={id} />,
      };
  }
  if (dock.channel !== undefined && dock.session !== undefined)
    panels[SESSION_DETAIL] = {
      label: dock.session.title,
      header: <SessionDockHeader dock={dock} session={dock.session} slot={setSessionSlot} />,
      content: (
        <SessionHeaderSlot.Provider value={sessionSlot}>
          {dock.session.content}
        </SessionHeaderSlot.Provider>
      ),
    };
  return (
    <>
      {dock.conversation(
        <ChannelWorkspace
          channelId={dock.channel?.id}
          tree={dock.childLayout.tree}
          setTree={dock.childLayout.setTree}
          panels={panels}
        />,
      )}
    </>
  );
}

function ChannelMessageContent(): ReactElement {
  const dock = useDock();
  const members = dock.members;
  const filesOpen = dock.channel !== undefined && dock.files?.open === true;
  const inboxOpen = dock.channel?.type === 'dm' && dock.inbox?.open === true;
  const detailEntryId = inboxOpen ? 'bot-inbox' : 'members';
  const detailLabel = dock.t(
    filesOpen ? 'generatedFiles.title' : inboxOpen ? 'entry.botInbox' : 'entry.members',
  );
  const closeDetail = () => {
    if (filesOpen) dock.files?.setOpen(false);
    else if (inboxOpen) dock.inbox?.setOpen(false);
    else members?.setOpen(false);
  };
  const detailProps = useEntryProps(detailEntryId);
  const DetailActions = dock.panels.get(detailEntryId)?.entry?.headerAction;
  const DetailBadge = dock.panels.get(detailEntryId)?.entry?.badge;
  return (
    <div className="bh-dock-body bh-message-split">
      <div className="bh-message-content">
        <DockBodySlot />
      </div>
      {members && (filesOpen || inboxOpen || (dock.channel?.type === 'group' && members.open)) && (
        <>
          <div
            className="bh-message-member-divider"
            role="separator"
            tabIndex={0}
            aria-label={detailLabel}
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={60}
            aria-valuenow={Math.round(members.ratio * 100)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              members.setRatio(members.ratio + (event.key === 'ArrowLeft' ? 0.02 : -0.02));
            }}
            onPointerDown={(event) => {
              if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const box = event.currentTarget.parentElement!.getBoundingClientRect();
              members.setRatio((box.right - event.clientX) / box.width);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
          <aside
            className="bh-message-members"
            aria-label={detailLabel}
            style={{ width: `${members.ratio * 100}%` }}
          >
            <AppearancePanelHeader
              id={filesOpen ? 'generated-files' : detailEntryId}
              label={detailLabel}
              t={dock.t}
            >
              <PanelHeader
                label={detailLabel}
                onHide={closeDetail}
                hideLabel={dock.t('dock.close', { label: detailLabel })}
                hideHint={dock.t('dock.headHintHide')}
                badge={
                  !filesOpen && DetailBadge && detailProps ? (
                    <DetailBadge key={entryScopeKey(detailProps)} {...detailProps} />
                  ) : undefined
                }
                action={
                  <>
                    {!filesOpen && DetailActions && detailProps && (
                      <DetailActions key={entryScopeKey(detailProps)} {...detailProps} />
                    )}
                    <Tooltip label={dock.t('dock.close', { label: detailLabel })} side="bottom">
                      <IconButton
                        aria-label={dock.t('dock.close', { label: detailLabel })}
                        onClick={closeDetail}
                      >
                        <ChannelSidebarIcon name="x" />
                      </IconButton>
                    </Tooltip>
                  </>
                }
              />
            </AppearancePanelHeader>
            <div
              className="bh-channel-subpanel-body"
              data-appearance-body={filesOpen ? 'generated-files' : detailEntryId}
            >
              {filesOpen ? <DockFilesSlot /> : <ChannelEntryContent entryId={detailEntryId} />}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

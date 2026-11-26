import { Tag } from './ds/tag.js';
import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type { SessionSubagent } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ChipButton } from './ds/chip-button.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { modelRouteText } from './session-rows.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const styles = stylex.create({
  note: { fontSize: text.metaSize, lineHeight: text.metaLine, color: color.muted },
});

export const SUBAGENT_STATE_TONE = {
  running: 'success',
  done: 'outline',
  failed: 'danger',
  cancelled: 'quiet',
  idle: 'quiet',
} as const;

export function SessionSubagentToggle({
  count,
  title,
  open,
  onToggle,
  t,
}: {
  count: number;
  title: string;
  open: boolean;
  onToggle(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ChipButton
      meta
      data-session-subagents-toggle=""
      data-session-meta-chip="subagents"
      aria-label={t(open ? 'sessions.subagents.hide' : 'sessions.subagents.show', { title })}
      aria-expanded={open}
      title={t('sessions.subagents.toggle', { count })}
      icon={<ChannelSidebarIcon name="bot" size={12} />}
      label={String(count)}
      onClick={onToggle}
    />
  );
}

type Load =
  | { status: 'loading' }
  | { status: 'ready'; subagents: readonly SessionSubagent[]; omitted: number }
  | { status: 'error'; error: string };

export function SessionSubagentList({
  actions,
  botSlug,
  sessionId,
  revision,
  canOpen,
  onSelect,
  selectedSessionId,
  t,
}: {
  actions: BridgeActions;
  botSlug: string;
  sessionId: string;
  revision: string;
  canOpen(sessionId: string): boolean;
  onSelect?: ((sessionId: string, title: string) => void) | undefined;
  selectedSessionId?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    const read = actions.sessionSubagents;
    if (read === undefined) {
      setLoad({ status: 'error', error: 'unavailable' });
      return;
    }
    let live = true;
    read(botSlug, sessionId).then(
      (value) => {
        if (live) setLoad({ status: 'ready', ...value });
      },
      (error: unknown) => {
        if (live)
          setLoad({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, botSlug, sessionId, revision]);
  const now = Date.now();
  return (
    <div ref={mount} data-session-subagents={sessionId}>
      {load.status === 'loading' ? (
        <span role="status" {...stylex.props(styles.note)}>
          {t('sessions.subagents.loading')}
        </span>
      ) : load.status === 'error' ? (
        <span role="alert" className="bh-error">
          {t('sessions.subagents.error', { error: load.error })}
        </span>
      ) : (
        <>
          <SidebarCardList flush label={t('sessions.subagents.label')}>
            {[...load.subagents].reverse().map((subagent) => {
              const title =
                subagent.title ??
                t('sessions.subagents.untitled', {
                  index: String(subagent.index).padStart(2, '0'),
                });
              const model =
                subagent.route === undefined ? undefined : modelRouteText(subagent.route);
              const openable = onSelect !== undefined || canOpen(subagent.sessionId);
              return (
                <SidebarCardRow
                  key={subagent.sessionId}
                  icon="bot"
                  iconLabel={t('sessions.subagents.label')}
                  title={title}
                  hint={model === undefined ? undefined : t('sessions.subagents.model', { model })}
                  mainClassName="bh-session-subagent-row"
                  state={subagent.state}
                  muted={!openable}
                  disabled={!openable}
                  expanded={
                    onSelect === undefined ? undefined : selectedSessionId === subagent.sessionId
                  }
                  {...(!openable
                    ? {}
                    : onSelect === undefined
                      ? { onClick: () => void actions.openSession(subagent.sessionId) }
                      : { onClick: () => onSelect(subagent.sessionId, title) })}
                  badge={
                    <Tag tone={SUBAGENT_STATE_TONE[subagent.state]}>
                      {t(`sessions.subagents.state.${subagent.state}`)}
                    </Tag>
                  }
                  meta={
                    <>
                      {model === undefined ? null : <span>{model}</span>}
                      {subagent.toolCount === 0 ? null : (
                        <span>
                          {t(
                            subagent.toolCount === 1
                              ? 'sessions.subagents.toolsOne'
                              : 'sessions.subagents.tools',
                            { count: subagent.toolCount },
                          )}
                        </span>
                      )}
                      {subagent.updatedAt === undefined ? null : (
                        <span>{formatRelativeTime(Date.parse(subagent.updatedAt), now, t)}</span>
                      )}
                    </>
                  }
                />
              );
            })}
          </SidebarCardList>
          {load.omitted === 0 ? null : (
            <span {...stylex.props(styles.note)}>
              {t('sessions.subagents.omitted', { count: load.omitted })}
            </span>
          )}
        </>
      )}
    </div>
  );
}

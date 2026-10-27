import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { SessionModelRoute, SessionSubagent } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const styles = stylex.create({
  toggle: { display: 'inline-flex', alignItems: 'center', columnGap: space.x1 },
  count: { fontSize: text.metaSize, lineHeight: text.metaLine, color: color.muted },
  note: { fontSize: text.metaSize, lineHeight: text.metaLine, color: color.muted },
});

const STATE_TONE = {
  running: 'success',
  done: 'outline',
  failed: 'danger',
  cancelled: 'quiet',
  idle: 'quiet',
} as const;

export function modelRouteText(route: SessionModelRoute): string {
  return `${route.provider}/${route.model}${
    route.reasoningEffort === undefined ? '' : ` · ${route.reasoningEffort}`
  }`;
}

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
  const label = t(open ? 'sessions.subagents.hide' : 'sessions.subagents.show', { title });
  return (
    <Tooltip label={t('sessions.subagents.toggle', { count })} side="top" portal delayMs={400}>
      <IconButton
        size="inline"
        data-session-subagents-toggle=""
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span {...stylex.props(styles.toggle)}>
          <ChannelSidebarIcon name="git-branch" size={14} />
          <span {...stylex.props(styles.count)}>{count}</span>
        </span>
      </IconButton>
    </Tooltip>
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
  t,
}: {
  actions: BridgeActions;
  botSlug: string;
  sessionId: string;
  revision: string;
  canOpen(sessionId: string): boolean;
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
              const openable = canOpen(subagent.sessionId);
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
                  {...(openable
                    ? { onClick: () => void actions.openSession(subagent.sessionId) }
                    : {})}
                  badge={
                    <Tag tone={STATE_TONE[subagent.state]}>
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

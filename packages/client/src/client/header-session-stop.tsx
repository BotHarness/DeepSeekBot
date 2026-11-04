import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  IconStopFillRegular,
  MenuSurface,
  Tag,
  useAnchoredPosition,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import {
  runningSessionCount,
  type RunningSession,
  type RunningSessionGroup,
} from './session-stop-model.js';
import type { BridgeActions } from './actions.js';
import { useDockPanelOpener } from './channel-dock.js';
import { setSessionTarget } from './session-target.js';
import type { BotSummary, ChannelSummary } from './store.js';

const styles = stylex.create({
  anchor: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    minWidth: 0,
  },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    flexShrink: 0,
    height: '20px',
    paddingInline: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.xs,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  chipDot: {
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.success,
  },
  surface: {
    position: 'fixed',
    zIndex: 1100,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    width: 'min(320px, calc(100vw - 24px))',
    maxHeight: 'min(60vh, 480px)',
    overflowY: 'auto',
    padding: space.x2,
    '--dsw-elevation-stroke-color': color.divider,
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.row,
    paddingInline: space.x3,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.row,
    paddingInlineStart: space.x3,
    paddingInlineEnd: space.x1,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  groupName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stopAll: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    height: size.inlineIcon,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.dangerSoft,
      ':disabled': 'transparent',
    },
    color: { default: color.muted, ':hover': color.danger, ':disabled': color.subtle },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.row,
    paddingInlineStart: space.x3,
    paddingInlineEnd: space.x1,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  rowIcon: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
  rowBody: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  rowTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  rowState: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  divider: {
    height: border.hairline,
    marginBlock: space.x2,
    marginInline: space.x3,
    backgroundColor: color.divider,
  },
  empty: {
    paddingBlock: space.x3,
    paddingInline: space.x3,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  error: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minHeight: size.row,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
});

export type SessionStopGroup = RunningSessionGroup<BotSummary>;

export interface HeaderSessionStopController {
  readonly open: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

export function useHeaderSessionStop(): HeaderSessionStopController {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((current) => !current) };
}

export function HeaderSessionChip({
  count,
  t,
}: {
  count: number;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (count === 0) return null;
  return (
    <span data-session-chip="" {...stylex.props(styles.chip)}>
      <span aria-hidden="true" {...stylex.props(styles.chipDot)} />
      {count}
      <span className="bh-sr-only">{t('sessionStop.chip', { count })}</span>
    </span>
  );
}

export function HeaderSessionStop({
  groups,
  controller,
  status,
  t,
  onStopSession,
  onStopBot,
  onOpenSessions,
  extraAction,
}: {
  groups: readonly SessionStopGroup[];
  controller: HeaderSessionStopController;
  status?: ReactNode;
  t: BotHarnessTranslate;
  onStopSession(botSlug: string, activityId: string): Promise<unknown>;
  onStopBot(botSlug: string): Promise<unknown>;
  onOpenSessions(botSlug: string | undefined): void;
  extraAction?: { label: string; icon: string; run(): void } | undefined;
}): ReactElement | null {
  const anchor = useRef<HTMLSpanElement>(null);
  const count = runningSessionCount(groups);
  if (count === 0 && status === undefined && !controller.open) return null;
  return (
    <span ref={anchor} data-header-session-stop="" {...stylex.props(styles.anchor)}>
      {count === 0 && status !== undefined ? (
        status
      ) : (
        <button
          type="button"
          data-session-stop-trigger=""
          aria-haspopup="dialog"
          aria-expanded={controller.open}
          aria-label={t('sessionStop.open', { count })}
          onClick={controller.toggle}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          {...stylex.props(styles.trigger)}
        >
          {status}
          <HeaderSessionChip count={count} t={t} />
        </button>
      )}
      {controller.open ? (
        <SessionStopPopover
          anchor={anchor}
          groups={groups}
          t={t}
          onClose={() => controller.setOpen(false)}
          onStopSession={onStopSession}
          onStopBot={onStopBot}
          onOpenSessions={onOpenSessions}
          extraAction={extraAction}
        />
      ) : null}
    </span>
  );
}

function sessionTitle(session: RunningSession, t: BotHarnessTranslate): string {
  return session.role === 'orchestrator'
    ? t('sessions.role.orchestrator')
    : (session.name ?? t('sessions.role.assignment'));
}

export function SessionStopPopover({
  anchor,
  groups,
  t,
  onClose,
  onStopSession,
  onStopBot,
  onOpenSessions,
  extraAction,
}: {
  anchor: RefObject<HTMLElement | null>;
  groups: readonly SessionStopGroup[];
  t: BotHarnessTranslate;
  onClose(): void;
  onStopSession(botSlug: string, activityId: string): Promise<unknown>;
  onStopBot(botSlug: string): Promise<unknown>;
  onOpenSessions(botSlug: string | undefined): void;
  extraAction?: { label: string; icon: string; run(): void } | undefined;
}): ReactElement {
  const panel = useRef<HTMLDivElement | null>(null);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const [stoppingBots, setStoppingBots] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string>();
  const position = useAnchoredPosition({
    open: true,
    anchorRef: anchor,
    panelRef: panel,
    align: 'start',
    gap: 6,
    margin: 12,
  });
  const close = useRef(onClose);
  close.current = onClose;
  const mount = useMountedResource<HTMLDivElement>((node) => {
    panel.current = node;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (node.contains(target) || anchor.current?.contains(target)) return;
      if (target.closest('[data-session-stop-opener]') !== null) return;
      close.current();
    };
    document.addEventListener('pointerdown', outside, true);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
      anchor.current?.querySelector<HTMLElement>('button')?.focus();
    };
    node.focus({ preventScroll: true });
    document.addEventListener('keydown', escape);
    return () => {
      panel.current = null;
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const run = (
    key: string,
    mark: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void,
    stop: () => Promise<unknown>,
  ): void => {
    setError(undefined);
    mark((current) => new Set(current).add(key));
    void stop().catch((reason: unknown) => {
      mark((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setError(
        t('sessionStop.failed', {
          reason: reason instanceof Error ? reason.message : String(reason),
        }),
      );
    });
  };
  const single = groups.length === 1 ? groups[0]?.bot.slug : undefined;
  return createPortal(
    <MenuSurface
      ref={mount}
      role="dialog"
      aria-label={t('sessionStop.title')}
      tabIndex={-1}
      data-session-stop-popover=""
      data-bh-appearance-owned=""
      className={stylex.props(styles.surface).className}
      style={position ?? { left: 0, top: 0, visibility: 'hidden' }}
    >
      <div {...stylex.props(styles.heading)}>{t('sessionStop.title')}</div>
      {groups.length === 0 ? (
        <div role="status" {...stylex.props(styles.empty)}>
          {t('sessionStop.empty')}
        </div>
      ) : (
        groups.map((group) => {
          const bot = group.bot;
          const allStopping =
            stoppingBots.has(bot.slug) ||
            group.sessions.every((session) => stopping.has(session.id));
          return (
            <section key={bot.slug} aria-label={bot.displayName} data-session-stop-bot={bot.slug}>
              <div {...stylex.props(styles.groupHead)}>
                <PersonaBotAvatar
                  t={t}
                  personaBotId={bot.slug}
                  name={bot.displayName}
                  src={bot.avatar}
                  appearance={bot.appearance}
                  avatarSeed={bot.avatarSeed}
                  size={20}
                  indicator={false}
                  still
                />
                <span {...stylex.props(styles.groupName)}>{bot.displayName}</span>
                <button
                  type="button"
                  data-session-stop-all=""
                  disabled={allStopping}
                  aria-busy={allStopping || undefined}
                  aria-label={
                    allStopping
                      ? t('sessions.status.stopping')
                      : t('sessionStop.stopAllNamed', { name: bot.displayName })
                  }
                  onClick={() => run(bot.slug, setStoppingBots, () => onStopBot(bot.slug))}
                  {...stylex.props(styles.stopAll)}
                >
                  <IconStopFillRegular size={10} />
                  {allStopping ? t('sessions.status.stopping') : t('sessionStop.stopAll')}
                </button>
              </div>
              <ul {...stylex.props(styles.group)}>
                {group.sessions.map((session) => {
                  const title = sessionTitle(session, t);
                  const rowStopping = stopping.has(session.id) || stoppingBots.has(bot.slug);
                  return (
                    <li
                      key={session.id}
                      data-session-stop-row={session.id}
                      data-session-role={session.role}
                      {...stylex.props(styles.row)}
                    >
                      <span aria-hidden="true" {...stylex.props(styles.rowIcon)}>
                        <ChannelSidebarIcon
                          name={session.role === 'orchestrator' ? 'bot' : 'list-checks'}
                          size={16}
                        />
                      </span>
                      <span {...stylex.props(styles.rowBody)}>
                        <span title={title} {...stylex.props(styles.rowTitle)}>
                          {title}
                        </span>
                        <span {...stylex.props(styles.rowState)}>
                          {rowStopping ? (
                            <Tag tone="warning">{t('sessions.status.stopping')}</Tag>
                          ) : (
                            t(
                              session.state === 'working'
                                ? 'activity.working'
                                : 'activity.thinking',
                            )
                          )}
                        </span>
                      </span>
                      <Tooltip label={t('sessions.stop')} side="top" portal delayMs={400}>
                        <IconButton
                          size="inline"
                          data-session-stop=""
                          disabled={rowStopping}
                          aria-busy={rowStopping || undefined}
                          aria-label={
                            rowStopping
                              ? t('sessions.status.stopping')
                              : t('sessions.stopNamed', { title })
                          }
                          onClick={() =>
                            run(session.id, setStopping, () => onStopSession(bot.slug, session.id))
                          }
                        >
                          <IconStopFillRegular size={12} />
                        </IconButton>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      {error === undefined ? null : (
        <div role="alert" {...stylex.props(styles.error)}>
          {error}
        </div>
      )}
      <div aria-hidden="true" {...stylex.props(styles.divider)} />
      <button
        type="button"
        data-session-stop-open-sessions=""
        onClick={() => {
          onClose();
          onOpenSessions(single);
        }}
        {...stylex.props(styles.footer)}
      >
        <ChannelSidebarIcon name="text-quote" size={16} />
        {t('sessionStop.openSessions')}
      </button>
      {extraAction === undefined ? null : (
        <button
          type="button"
          onClick={() => {
            onClose();
            extraAction.run();
          }}
          {...stylex.props(styles.footer)}
        >
          <ChannelSidebarIcon name={extraAction.icon} size={16} />
          {extraAction.label}
        </button>
      )}
    </MenuSurface>,
    document.body,
  );
}

export function ConversationSessionStop({
  channel,
  groups,
  controller,
  actions,
  t,
  status,
  onOpenProfile,
}: {
  channel: ChannelSummary;
  groups: readonly SessionStopGroup[];
  controller: HeaderSessionStopController;
  actions: Pick<BridgeActions, 'stopSession' | 'stopBot'>;
  t: BotHarnessTranslate;
  status?: ReactNode;
  onOpenProfile?: (() => void) | undefined;
}): ReactElement | null {
  const openPanel = useDockPanelOpener();
  return (
    <HeaderSessionStop
      groups={groups}
      controller={controller}
      status={status}
      t={t}
      onStopSession={(botSlug, activityId) =>
        actions.stopSession(botSlug, { activityId }, channel.id)
      }
      onStopBot={(botSlug) => actions.stopBot(channel.id, botSlug)}
      onOpenSessions={(botSlug) => {
        if (channel.type === 'group') setSessionTarget(channel.id, botSlug ?? '');
        openPanel?.('sessions');
      }}
      extraAction={
        channel.type === 'dm' && onOpenProfile !== undefined
          ? { label: t('profile.view'), icon: 'id-card', run: onOpenProfile }
          : undefined
      }
    />
  );
}

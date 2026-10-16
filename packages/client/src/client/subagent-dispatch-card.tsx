import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { SubagentDispatch } from './subagent-dispatch.js';

const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.35 },
  '100%': { opacity: 1 },
});

const statusStyles = stylex.create({
  queued: { color: color.muted },
  running: { color: color.accent },
  completed: { color: color.success },
  failed: { color: color.danger },
  declined: { color: color.warning },
});

const styles = stylex.create({
  card: {
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    columnGap: space.x3,
    minWidth: 0,
  },
  dot: {
    flexShrink: 0,
    width: space.x3,
    height: space.x3,
    borderRadius: radius.round,
    backgroundColor: 'currentColor',
  },
  dotRunning: {
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  line: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    color: color.fg,
  },
  meta: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  pill: {
    flexShrink: 0,
    padding: `${space.x1} ${space.x2}`,
    borderRadius: radius.round,
    backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.x4,
    rowGap: space.x2,
    cursor: 'pointer',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    color: color.fg,
    width: '100%',
    minWidth: '240px',
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'start',
  },
  summaryLabel: {
    display: 'flex',
    alignItems: 'center',
    columnGap: space.x2,
    minWidth: 0,
  },
  chevron: {
    flexShrink: 0,
    color: color.muted,
    transform: 'rotate(-90deg)',
    transitionProperty: 'transform',
    transitionDuration: '0.15s',
  },
  chevronOpen: { transform: 'none' },
  counts: {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.x3,
    rowGap: space.x1,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  count: {
    display: 'flex',
    alignItems: 'center',
    columnGap: space.x2,
  },
});

export function DispatchRow({
  dispatch,
  t,
}: {
  dispatch: SubagentDispatch;
  t: BotHarnessTranslate;
}): ReactElement {
  const route = dispatch.resolvedRoute;
  const description =
    dispatch.description === '' ? t('subagentDispatch.title') : dispatch.description;
  const routeText =
    route === undefined
      ? t('subagentDispatch.modelUnavailable')
      : `${route.provider}/${route.model}${
          route.reasoningEffort === undefined ? '' : ` · ${route.reasoningEffort}`
        }`;
  const advisor = dispatch.advisor;
  const advisorText =
    advisor === undefined
      ? undefined
      : advisor === 'unavailable'
        ? t('subagentDispatch.advisorUnavailable')
        : `${t('subagentDispatch.advisorSuggested')} · ${advisor.provider}/${advisor.model}${
            advisor.reasoningEffort === undefined ? '' : ` · ${advisor.reasoningEffort}`
          }`;
  return (
    <div {...stylex.props(styles.row)}>
      <span
        {...stylex.props(
          styles.dot,
          statusStyles[dispatch.status],
          dispatch.status === 'running' && styles.dotRunning,
        )}
      />
      <span {...stylex.props(styles.middle)}>
        <span {...stylex.props(styles.line)} title={description}>
          {description}
        </span>
        <span {...stylex.props(styles.meta)} title={routeText}>
          {routeText}
        </span>
        {advisorText === undefined ? null : (
          <span {...stylex.props(styles.meta)} title={advisorText}>
            {advisorText}
          </span>
        )}
      </span>
      <span {...stylex.props(styles.pill, statusStyles[dispatch.status])}>
        {t(`subagentDispatch.status.${dispatch.status}`)}
      </span>
    </div>
  );
}

export function SubagentDispatchCard({
  dispatch,
  t,
}: {
  dispatch: SubagentDispatch;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div
      {...stylex.props(styles.card)}
      aria-label={t('subagentDispatch.title')}
      data-dispatch-kind="subagent"
      data-dispatch-status={dispatch.status}
    >
      <DispatchRow dispatch={dispatch} t={t} />
    </div>
  );
}

export function SubagentDispatchGroup({
  dispatches,
  open,
  onToggle,
  t,
}: {
  dispatches: readonly SubagentDispatch[];
  open: boolean;
  onToggle(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const counts = new Map<SubagentDispatch['status'], number>();
  for (const dispatch of dispatches)
    counts.set(dispatch.status, (counts.get(dispatch.status) ?? 0) + 1);
  return (
    <button
      type="button"
      {...stylex.props(styles.summary)}
      aria-expanded={open}
      data-dispatch-kind="subagent-group"
      onClick={onToggle}
    >
      <span {...stylex.props(styles.summaryLabel)}>
        <IconChevronDownOutlineRegular
          size={14}
          {...stylex.props(styles.chevron, open && styles.chevronOpen)}
        />
        {t('subagentDispatch.group', { count: dispatches.length })}
      </span>
      <span {...stylex.props(styles.counts)}>
        {[...counts].map(([status, count]) => (
          <span key={status} {...stylex.props(styles.count)}>
            <span {...stylex.props(styles.dot, statusStyles[status])} />
            {t(`subagentDispatch.status.${status}`)} {String(count)}
          </span>
        ))}
      </span>
    </button>
  );
}

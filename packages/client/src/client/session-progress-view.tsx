import type { ReactElement, ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { SessionGoal, SessionProgress, SessionTodo } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export const STUCK_AFTER_MS = 10 * 60 * 1000;

const RING = 5.5;
const RING_LENGTH = 2 * Math.PI * RING;

const styles = stylex.create({
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    maxWidth: '100%',
    height: '20px',
    paddingInline: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  goalText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ring: { flexShrink: 0 },
  glyph: { display: 'inline-flex', flexShrink: 0 },
  track: { stroke: color.well },
  fill: { stroke: color.accent },
  fillDone: { stroke: color.success },
});

export function todoCount(todos: readonly SessionTodo[] | undefined): {
  done: number;
  total: number;
} {
  return {
    done: todos?.filter((todo) => todo.status === 'completed').length ?? 0,
    total: todos?.length ?? 0,
  };
}

export function currentTodo(progress: SessionProgress | undefined): string | undefined {
  return progress?.todos?.find((todo) => todo.status === 'in_progress')?.content;
}

export function isStuck(
  running: boolean,
  progress: SessionProgress | undefined,
  now: number,
): boolean {
  return (
    running && progress?.lastEventAt !== undefined && now - progress.lastEventAt >= STUCK_AFTER_MS
  );
}

export function TodoRing({ done, total }: { done: number; total: number }): ReactElement {
  const share = total === 0 ? 0 : done / total;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      {...stylex.props(styles.ring)}
    >
      <circle
        cx="7"
        cy="7"
        r={RING}
        fill="none"
        strokeWidth="2.5"
        {...stylex.props(styles.track)}
      />
      <circle
        cx="7"
        cy="7"
        r={RING}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${RING_LENGTH * share} ${RING_LENGTH}`}
        transform="rotate(-90 7 7)"
        {...stylex.props(share === 1 ? styles.fillDone : styles.fill)}
      />
    </svg>
  );
}

export function SessionMetaChip({
  kind,
  icon,
  label,
  title,
}: {
  kind: string;
  icon: ReactNode;
  label: string;
  title?: string | undefined;
}): ReactElement {
  return (
    <span data-session-meta-chip={kind} title={title ?? label} {...stylex.props(styles.chip)}>
      <span {...stylex.props(styles.glyph)}>{icon}</span>
      <span {...stylex.props(styles.goalText)}>{label}</span>
    </span>
  );
}

export function TodoProgressChip({
  todos,
  t,
}: {
  todos: readonly SessionTodo[] | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { done, total } = todoCount(todos);
  if (total === 0) return null;
  const label = t('sessions.progress.todos', { done, total });
  return (
    <span data-session-todos={`${done}/${total}`} title={label} {...stylex.props(styles.chip)}>
      <TodoRing done={done} total={total} />
      <span aria-label={label}>
        {done}/{total}
      </span>
    </span>
  );
}

export function GoalChip({
  goal,
  t,
}: {
  goal: SessionGoal | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (goal === undefined) return null;
  const label = t('sessions.progress.goal', {
    objective: goal.objective,
    phase: t(`sessions.goal.${goal.phase}`),
  });
  return (
    <span data-session-goal={goal.phase} title={label} {...stylex.props(styles.chip)}>
      <ChannelSidebarIcon name="target" size={12} />
      <span {...stylex.props(styles.goalText)}>{goal.objective}</span>
    </span>
  );
}

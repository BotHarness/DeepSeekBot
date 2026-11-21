import * as stylex from '@stylexjs/stylex';
import { useContext } from 'react';
import { createPortal } from 'react-dom';

import type { SessionGoal, SessionTodo } from './bridge.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { SessionHeaderSlot } from './session-header-slot.js';
import { SessionProgressChips } from './session-progress-view.js';

const styles = stylex.create({
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    paddingInline: space.x4,
    paddingBottom: space.x3,
  },
});

export function SessionDetailHeaderChips({
  goal,
  todos,
  open,
  toggle,
  t,
}: {
  goal: SessionGoal | undefined;
  todos: SessionTodo[] | undefined;
  open: 'goal' | 'todos' | undefined;
  toggle(key: 'goal' | 'todos'): void;
  t: BotHarnessTranslate;
}) {
  const slot = useContext(SessionHeaderSlot);
  if (goal === undefined && todos === undefined) return null;
  const chips = (
    <SessionProgressChips goal={goal} todos={todos} open={open} toggle={toggle} t={t} />
  );
  return slot === null ? (
    <div {...stylex.props(styles.chips)}>{chips}</div>
  ) : (
    createPortal(chips, slot)
  );
}

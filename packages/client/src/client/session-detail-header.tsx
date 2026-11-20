import * as stylex from '@stylexjs/stylex';
import { useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ModelCatalogEntry } from '@botharness/host-client/model-catalog';

import type { SessionGoal, SessionTodo, SessionTranscript } from './bridge.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { SessionHeaderSlot } from './session-header-slot.js';
import { SessionProgressChips } from './session-progress-view.js';
import { SessionTargetChip } from './session-target-chip.js';

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
  transcript,
  catalog,
  goal,
  todos,
  open,
  toggle,
  t,
}: {
  transcript: SessionTranscript | undefined;
  catalog: readonly ModelCatalogEntry[] | undefined;
  goal: SessionGoal | undefined;
  todos: SessionTodo[] | undefined;
  open: 'goal' | 'todos' | undefined;
  toggle(key: 'goal' | 'todos'): void;
  t: BotHarnessTranslate;
}) {
  const slot = useContext(SessionHeaderSlot);
  if (
    transcript?.currentTarget === undefined &&
    transcript?.engine === undefined &&
    goal === undefined &&
    todos === undefined
  )
    return null;
  const chips = (
    <>
      <SessionTargetChip
        target={transcript?.currentTarget}
        engine={transcript?.engine}
        models={catalog}
        header
        t={t}
      />
      <SessionProgressChips goal={goal} todos={todos} open={open} toggle={toggle} t={t} />
    </>
  );
  return slot === null ? (
    <div {...stylex.props(styles.chips)}>{chips}</div>
  ) : (
    createPortal(chips, slot)
  );
}

import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { SubagentDispatch } from './subagent-dispatch.js';

const styles = stylex.create({
  card: {
    display: 'grid',
    gap: space.x3,
    padding: space.x4,
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.x4,
    rowGap: space.x2,
    cursor: 'pointer',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
  },
  body: { marginTop: space.x3 },
  description: { color: color.fg },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  queued: { color: color.muted },
  running: { color: color.accent },
  completed: { color: color.success },
  failed: { color: color.danger },
  declined: { color: color.warning },
});

export function SubagentDispatchCard({
  dispatch,
  t,
}: {
  dispatch: SubagentDispatch;
  t: BotHarnessTranslate;
}): ReactElement {
  const route = dispatch.resolvedRoute;
  return (
    <details
      {...stylex.props(styles.card)}
      aria-label={t('subagentDispatch.title')}
      data-dispatch-kind="subagent"
      data-dispatch-status={dispatch.status}
    >
      <summary {...stylex.props(styles.summary)}>
        <span {...stylex.props(styles.description)}>
          {dispatch.description === ''
            ? t('subagentDispatch.title')
            : `${t('subagentDispatch.title')} · ${dispatch.description}`}
        </span>
        <span {...stylex.props(styles[dispatch.status])}>
          {t(`subagentDispatch.status.${dispatch.status}`)}
        </span>
      </summary>
      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.meta)}>
          {t('subagentDispatch.model')}
          {' · '}
          {route === undefined
            ? t('subagentDispatch.modelUnavailable')
            : `${route.provider}/${route.model}`}
          {route?.reasoningEffort === undefined ? null : (
            <>
              {' · '}
              {t('subagentDispatch.effort')}
              {' · '}
              {route.reasoningEffort}
            </>
          )}
        </p>
      </div>
    </details>
  );
}

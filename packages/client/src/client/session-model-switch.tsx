import * as stylex from '@stylexjs/stylex';
import { Fragment } from 'react';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { TurnModelSwitch } from '@botharness/host-protocol/turn-target';

import { ink, space, type } from './ds/tobs.stylex.js';
import { ModelBrandIcon } from './model-brand.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x1,
    minWidth: 0,
    color: ink.tertiary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    whiteSpace: 'nowrap',
  },
  reason: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  pair: { display: 'inline-flex', alignItems: 'center', gap: space.x1, minWidth: 0 },
  model: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    flex: '0 1 auto',
  },
  name: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  fixed: { flex: 'none' },
  wrap: { flexWrap: 'wrap', whiteSpace: 'normal' },
});

export function SessionModelSwitch({
  item,
  catalog,
  native = false,
  t,
}: {
  item: TurnModelSwitch;
  catalog: TurnTargetCatalog;
  native?: boolean;
  t: BotHarnessTranslate;
}) {
  const reason = item.reason;
  const from = turnTargetLabel(item.from, catalog);
  const to = turnTargetLabel(item.to, catalog);
  const translation = `sessions.model.${reason ?? 'switched'}` as const;
  const name = (label: typeof from) =>
    native
      ? label.short
      : `${label.short} ${t(label.external ? 'sessions.model.sub' : 'sessions.model.api')}`;
  const model = (label: ReturnType<typeof turnTargetLabel>) => (
    <span title={label.short} {...stylex.props(styles.model)}>
      <span {...stylex.props(styles.fixed)}>
        <ModelBrandIcon brand={label.brand} size={14} />
      </span>
      <span {...stylex.props(styles.name)}>{label.short}</span>
    </span>
  );
  return (
    <div
      data-session-model-switch=""
      role="note"
      aria-label={t(translation, { from: name(from), to: name(to) })}
      {...stylex.props(styles.row, native && styles.wrap)}
    >
      {native ? (
        t(translation, { from: '\uE000from\uE000', to: '\uE000to\uE000' })
          .split('\uE000')
          .map((part, index) => (
            <Fragment key={index}>
              {part === 'from' ? model(from) : part === 'to' ? model(to) : part}
            </Fragment>
          ))
      ) : (
        <>
          {reason === undefined ? null : (
            <span aria-hidden {...stylex.props(styles.reason)}>
              {t(`sessions.model.reason.${reason}` as const)} ·
            </span>
          )}
          <span aria-hidden {...stylex.props(styles.pair)}>
            {model(from)}
            <span {...stylex.props(styles.fixed)}>→</span>
            {model(to)}
          </span>
        </>
      )}
    </div>
  );
}

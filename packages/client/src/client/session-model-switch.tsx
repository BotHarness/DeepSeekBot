import * as stylex from '@stylexjs/stylex';
import { Fragment } from 'react';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { TurnModelSwitch, TurnTarget } from '@botharness/host-protocol/turn-target';

import { ink, space, type } from './ds/tobs.stylex.js';
import { Tag } from './ds/tag.js';
import { ModelBrandIcon } from './model-brand.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  row: {
    textAlign: 'center',
    color: ink.tertiary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  model: { display: 'inline-flex', alignItems: 'center', gap: space.x1 },
});

export function SessionModelSwitch({
  item,
  catalog,
  t,
}: {
  item: TurnModelSwitch;
  catalog: TurnTargetCatalog;
  t: BotHarnessTranslate;
}) {
  const key = `sessions.model.${item.reason ?? 'switched'}` as const;
  const name = (target: TurnTarget) => turnTargetLabel(target, catalog);
  const targetMarkup = (target: TurnTarget) => {
    const label = name(target);
    return (
      <span {...stylex.props(styles.model)}>
        <ModelBrandIcon brand={label.brand} size={14} />
        <span>{label.short}</span>
        <Tag tone="quiet">{t(label.external ? 'sessions.model.sub' : 'sessions.model.api')}</Tag>
      </span>
    );
  };
  return (
    <div
      data-session-model-switch=""
      role="note"
      aria-label={t(key, { from: name(item.from).short, to: name(item.to).short })}
      {...stylex.props(styles.row)}
    >
      {t(key, { from: '\u0000from\u0000', to: '\u0000to\u0000' })
        .split('\u0000')
        .map((part, index) => (
          <Fragment key={index}>
            {part === 'from'
              ? targetMarkup(item.from)
              : part === 'to'
                ? targetMarkup(item.to)
                : part}
          </Fragment>
        ))}
    </div>
  );
}

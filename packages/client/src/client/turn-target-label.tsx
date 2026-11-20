import * as stylex from '@stylexjs/stylex';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import type { ModelCatalogEntry } from '@botharness/host-client/model-catalog';
import { turnTargetLabel } from '@botharness/host-client/turn-target';
import { ink, space, type } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { EngineBrandIcon, ModelBrandIcon } from './model-brand.js';

const styles = stylex.create({
  path: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    color: ink.tertiary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  target: { display: 'inline-flex', alignItems: 'center', gap: space.x1 },
});

export function TurnTargetLabel({
  targets,
  catalog,
  t,
}: {
  targets: readonly TurnTarget[];
  catalog: readonly ModelCatalogEntry[] | undefined;
  t: BotHarnessTranslate;
}) {
  return (
    <span data-turn-targets="" {...stylex.props(styles.path)}>
      {targets.map((target, index) => {
        const label = turnTargetLabel(target, catalog);
        return (
          <span key={index} title={label.name} {...stylex.props(styles.target)}>
            {index === 0 ? null : <span>→</span>}
            {label.external ? (
              <EngineBrandIcon brand={label.brand} size={14} label={t('engine.externalLabel')} />
            ) : (
              <ModelBrandIcon brand={label.brand} size={14} />
            )}
            <span>{[label.short, label.effort].filter(Boolean).join(' · ')}</span>
          </span>
        );
      })}
    </span>
  );
}

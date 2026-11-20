import * as stylex from '@stylexjs/stylex';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { turnTargetLabel } from '@botharness/host-client/turn-target';
import { Tag } from './ds/tag.js';
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
  t,
}: {
  targets: readonly TurnTarget[];
  t: BotHarnessTranslate;
}) {
  return (
    <span data-turn-targets="" {...stylex.props(styles.path)}>
      {targets.map((target, index) => {
        const label = turnTargetLabel(target);
        const Icon = label.external ? EngineBrandIcon : ModelBrandIcon;
        return (
          <span key={index} title={label.name} {...stylex.props(styles.target)}>
            {index === 0 ? null : <span>→</span>}
            <Icon brand={label.brand} size={12} />
            {label.short}
            {label.external ? <Tag tone="outline">{t('engine.externalLabel')}</Tag> : null}
          </span>
        );
      })}
    </span>
  );
}

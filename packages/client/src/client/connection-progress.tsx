import * as stylex from '@stylexjs/stylex';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    gap: space.x2,
    padding: 0,
    margin: 0,
    width: '100%',
    listStyleType: 'none',
  },
  step: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'start',
  },
  active: { color: color.fg, fontWeight: text.strong },
  bar: { height: space.x1, borderRadius: radius.round, backgroundColor: color.well },
  reached: { backgroundColor: color.accent },
});

export function ConnectionProgress({
  step,
  joining = false,
  t,
}: {
  step: number;
  joining?: boolean;
  t: BotHarnessTranslate;
}) {
  const labels = joining
    ? (['connections.stepLink', 'connections.stepIdentity', 'connections.stepChannels'] as const)
    : (['connections.stepMethod', 'connections.stepPrepare', 'connections.stepApprove'] as const);
  return (
    <ol aria-label={t('connections.progress')} {...stylex.props(styles.list)}>
      {labels.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          {...stylex.props(styles.step, index === step && styles.active)}
        >
          <span aria-hidden="true" {...stylex.props(styles.bar, index <= step && styles.reached)} />
          <span>
            {index + 1}. {t(label)}
          </span>
        </li>
      ))}
    </ol>
  );
}

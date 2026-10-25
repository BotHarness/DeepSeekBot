import * as stylex from '@stylexjs/stylex';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    padding: 0,
    margin: 0,
    width: '100%',
    listStyleType: 'none',
  },
  step: {
    flexGrow: { default: 1, ':last-child': 0 },
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
  },
  active: { color: color.fg, fontWeight: text.strong },
  dot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.inlineIcon,
    height: size.inlineIcon,
    borderRadius: radius.round,
    cornerShape: 'round',
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  reached: { backgroundColor: color.accent, color: color.onAccent },
  line: {
    flexGrow: 1,
    minWidth: space.x4,
    height: border.hairline,
    backgroundColor: color.border,
  },
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
          <span aria-hidden="true" {...stylex.props(styles.dot, index <= step && styles.reached)}>
            {index < step ? <ChannelSidebarIcon name="check" size={14} /> : index + 1}
          </span>
          <span>{t(label)}</span>
          {index < labels.length - 1 ? (
            <span aria-hidden="true" {...stylex.props(styles.line)} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

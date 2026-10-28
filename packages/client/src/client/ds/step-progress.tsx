import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { border, color, radius, size, space, text } from './tokens.stylex.js';

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
  title: { whiteSpace: 'nowrap' },
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

export function StepProgress({
  label,
  steps,
  step,
  titles = 'all',
}: {
  readonly label: string;
  readonly steps: readonly string[];
  readonly step: number;
  readonly titles?: 'all' | 'current';
}): ReactElement {
  return (
    <ol aria-label={label} {...stylex.props(styles.list)}>
      {steps.map((title, index) => (
        <li
          key={title}
          aria-current={index === step ? 'step' : undefined}
          {...stylex.props(styles.step, index === step && styles.active)}
        >
          <span aria-hidden="true" {...stylex.props(styles.dot, index <= step && styles.reached)}>
            {index < step ? <ChannelSidebarIcon name="check" size={14} /> : index + 1}
          </span>
          {titles === 'all' || index === step ? (
            <span {...stylex.props(styles.title)}>{title}</span>
          ) : (
            <span hidden>{title}</span>
          )}
          {index < steps.length - 1 ? (
            <span aria-hidden="true" {...stylex.props(styles.line)} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

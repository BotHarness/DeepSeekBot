import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { border, color, radius, size, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minHeight: size.row,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    textAlign: 'start',
  },
  toggle: {
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  summary: { listStyle: 'none' },
  flush: { borderRadius: 0 },
  quiet: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  quietLabel: { fontWeight: text.regular },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    transition: 'transform 150ms var(--ds-ease-in-out, ease)',
  },
  collapsed: { transform: 'rotate(-90deg)' },
  label: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: text.strong,
  },
  count: {
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function GroupHeading({
  label,
  count,
  countLabel,
  title,
  expanded,
  onToggle,
  summary = false,
  quiet = false,
  flush = false,
}: {
  readonly label: ReactNode;
  readonly count: ReactNode;
  readonly countLabel?: string | undefined;
  readonly title?: string | undefined;
  readonly expanded?: boolean;
  readonly onToggle?: (() => void) | undefined;
  readonly summary?: boolean;
  readonly quiet?: boolean;
  readonly flush?: boolean | undefined;
}): ReactElement {
  const chevron = (
    <span
      aria-hidden="true"
      data-panel-chevron=""
      {...stylex.props(styles.chevron, expanded === false && styles.collapsed)}
    >
      <IconChevronDownOutlineRegular size={14} />
    </span>
  );
  const content = (
    <>
      <span {...stylex.props(styles.label, quiet && styles.quietLabel)}>{label}</span>
      <span data-group-count="" title={countLabel} {...stylex.props(styles.count)}>
        {count}
      </span>
    </>
  );
  if (summary)
    return (
      <summary
        data-group-heading=""
        title={title}
        {...stylex.props(
          styles.heading,
          flush && styles.flush,
          styles.toggle,
          styles.summary,
          quiet && styles.quiet,
        )}
      >
        {chevron}
        {content}
      </summary>
    );
  if (onToggle === undefined)
    return (
      <div
        data-group-heading=""
        title={title}
        {...stylex.props(styles.heading, flush && styles.flush, quiet && styles.quiet)}
      >
        {content}
      </div>
    );
  return (
    <button
      type="button"
      data-group-heading=""
      title={title}
      aria-expanded={expanded}
      onClick={onToggle}
      {...stylex.props(styles.heading, flush && styles.flush, styles.toggle, quiet && styles.quiet)}
    >
      {chevron}
      {content}
    </button>
  );
}

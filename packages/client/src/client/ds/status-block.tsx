import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { border, color, radius, space, text } from './tokens.stylex.js';

/**
 * Borderless status blocks shared by the connection screens (Tobs Connect, private
 * connection, LAN, Tailscale): one block per state with a colour fill and an icon,
 * one primary action, yellow when the user needs to act, and details folded under a
 * disclosure.
 */
const NARROW = '@container (max-width: 480px)';

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0, width: '100%' },
  heading: {
    margin: 0,
    paddingBottom: space.x1,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
    textAlign: 'start',
    containerType: 'inline-size',
  },
  warningCard: { backgroundColor: color.warningSoft },
  head: {
    display: 'flex',
    flexWrap: { default: 'nowrap', [NARROW]: 'wrap' },
    alignItems: 'flex-start',
    gap: space.x3,
    minWidth: 0,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '36px',
    height: '36px',
    borderRadius: radius.sm,
    backgroundColor: color.base,
    color: color.muted,
  },
  accent: { backgroundColor: color.accentTint, color: color.accent },
  success: { color: color.success },
  warning: { backgroundColor: color.base, color: color.warning },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flexGrow: 1,
    flexBasis: { default: 'auto', [NARROW]: 'calc(100% - 48px)' },
    minWidth: 0,
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  body: { margin: 0, color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  // In a narrow block (a small dialog) the action moves under the text instead of
  // squeezing it, lined up with the title.
  action: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    paddingInlineStart: { default: 0, [NARROW]: '44px' },
  },
  disclosure: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    padding: space.x4,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.md,
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    cursor: 'pointer',
    textAlign: 'start',
    font: 'inherit',
  },
  chevron: { color: color.muted, transitionProperty: 'transform', transitionDuration: '120ms' },
  chevronOpen: { transform: 'rotate(90deg)' },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    paddingInline: space.x4,
    paddingBottom: space.x2,
    minWidth: 0,
    textAlign: 'start',
  },
  fact: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  factRow: { display: 'flex', alignItems: 'center', gap: space.x3, minWidth: 0, flexWrap: 'wrap' },
  grow: { display: 'flex', flexDirection: 'column', gap: space.x1, flexGrow: 1, minWidth: 0 },
  label: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  value: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.lg,
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: color.base, ':hover': color.hover },
    color: color.fg,
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'start',
  },
  chipOnWell: { backgroundColor: { default: color.surface, ':hover': color.hover } },
  chipText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  chipIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    flexShrink: 0,
    color: color.accent,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function StatusBadge({ icon, tone }: { icon: string; tone: StatusTone }): ReactElement {
  return (
    <span
      aria-hidden="true"
      {...stylex.props(
        styles.badge,
        tone === 'accent' && styles.accent,
        tone === 'success' && styles.success,
        tone === 'warning' && styles.warning,
      )}
    >
      <ChannelSidebarIcon name={icon} size={18} />
    </span>
  );
}

/** The small muted heading above a column of status blocks. */
export function StatusHeading({
  data,
  children,
}: {
  data?: Record<`data-${string}`, string>;
  children: ReactNode;
}): ReactElement {
  return (
    <h3 {...data} {...stylex.props(styles.heading)}>
      {children}
    </h3>
  );
}

/** A column of status blocks, optionally under a heading. */
export function StatusStack({
  title,
  data,
  children,
}: {
  title?: string;
  data?: Record<`data-${string}`, string>;
  children: ReactNode;
}): ReactElement {
  return (
    <div {...data} {...stylex.props(styles.stack)}>
      {title === undefined ? null : <StatusHeading>{title}</StatusHeading>}
      {children}
    </div>
  );
}

/**
 * One state: icon badge, title, body and at most one action. A `warning` tone fills the
 * whole block yellow, which means the user has to do something.
 */
export function StatusBlock({
  icon,
  tone,
  title,
  body,
  action,
  data,
  children,
}: {
  icon: string;
  tone: StatusTone;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  data?: Record<`data-${string}`, string | undefined>;
  children?: ReactNode;
}): ReactElement {
  return (
    <div {...data} {...stylex.props(styles.card, tone === 'warning' && styles.warningCard)}>
      <div {...stylex.props(styles.head)}>
        <StatusBadge icon={icon} tone={tone} />
        <div {...stylex.props(styles.copy)}>
          <p {...stylex.props(styles.title)}>{title}</p>
          {body === undefined ? null : <div {...stylex.props(styles.body)}>{body}</div>}
        </div>
        {action === undefined ? null : <div {...stylex.props(styles.action)}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Folds details (account, addresses, switches) away from the status block. */
export function StatusDisclosure({
  icon,
  title,
  hint,
  open,
  onToggle,
  data,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  open: boolean;
  onToggle(): void;
  data?: Record<`data-${string}`, string>;
  children: ReactNode;
}): ReactElement {
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        {...data}
        onClick={onToggle}
        {...stylex.props(styles.disclosure)}
      >
        <StatusBadge icon={icon} tone="neutral" />
        <span {...stylex.props(styles.copy)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          {hint === undefined ? null : <span {...stylex.props(styles.body)}>{hint}</span>}
        </span>
        <span {...stylex.props(styles.chevron, open && styles.chevronOpen)}>
          <ChannelSidebarIcon name="chevron-right" size={16} />
        </span>
      </button>
      {open ? <div {...stylex.props(styles.details)}>{children}</div> : null}
    </>
  );
}

/** A labelled value inside a disclosure, with an optional control on the right. */
export function StatusFact({
  label,
  children,
  control,
  data,
}: {
  label: string;
  children: ReactNode;
  control?: ReactNode;
  data?: Record<`data-${string}`, string>;
}): ReactElement {
  const fact = (
    <div {...(control === undefined ? data : {})} {...stylex.props(styles.grow)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.value)}>{children}</span>
    </div>
  );
  if (control === undefined) return fact;
  return (
    <div {...data} {...stylex.props(styles.factRow)}>
      {fact}
      {control}
    </div>
  );
}

/**
 * A URL or command shown as a chip; tapping it copies the value. Replaces a separate
 * copy button next to the value, so the user can paste it into any browser or terminal.
 */
export function CopyChip({
  value,
  copyLabel,
  copiedLabel,
  well = false,
  marker = 'data-copy-chip',
}: {
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Set when the chip sits outside a status block (on a well or the dialog itself). */
  well?: boolean;
  /** Data attribute that carries '' or 'copied', for tests and e2e scripts. */
  marker?: `data-${string}`;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };
  return (
    <button
      type="button"
      {...{ [marker]: copied ? 'copied' : '' }}
      aria-label={copyLabel}
      title={value}
      onClick={copy}
      {...stylex.props(styles.chip, well && styles.chipOnWell)}
    >
      <span {...stylex.props(styles.chipText)}>{value}</span>
      <span aria-live="polite" {...stylex.props(styles.chipIcon)}>
        <ChannelSidebarIcon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? copiedLabel : null}
      </span>
    </button>
  );
}

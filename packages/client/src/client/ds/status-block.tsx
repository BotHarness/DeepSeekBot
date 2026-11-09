import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { Tooltip } from './tooltip.js';
import { border, color, radius, space, text } from './tokens.stylex.js';

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
  group: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0, width: '100%' },
  groupHead: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  groupTitle: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  info: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.x1,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.round,
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.subtle,
    cursor: 'help',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: space.x2,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
    textAlign: 'start',
  },
  divider: {
    height: border.hairline,
    marginInline: space.x4,
    backgroundColor: color.divider,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    color: color.fg,
    gap: space.x3,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    minWidth: 0,
  },
  rowButton: {
    width: '100%',
    borderWidth: 0,
    borderStyle: 'none',
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.accentText,
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'start',
  },
  rowTitle: {
    color: 'inherit',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    overflowWrap: 'anywhere',
  },
  rowMeta: { color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  rowWarning: { color: color.warning },
  rowEnd: { display: 'flex', alignItems: 'center', gap: space.x2, flexShrink: 0 },
  rowDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    paddingInline: space.x4,
    paddingBottom: space.x4,
    minWidth: 0,
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.accent,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    cursor: 'pointer',
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
  well?: boolean;
  marker?: `data-${string}`;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
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

export function InfoTip({ label }: { label: string }): ReactElement {
  return (
    <Tooltip label={label} side="top" portal>
      <span
        tabIndex={0}
        role="img"
        aria-label={label}
        data-info-tip=""
        {...stylex.props(styles.info)}
      >
        <ChannelSidebarIcon name="info" size={14} />
      </span>
    </Tooltip>
  );
}

export function StatusGroup({
  title,
  info,
  data,
  children,
}: {
  title?: string;
  info?: string;
  data?: Record<`data-${string}`, string>;
  children: ReactNode;
}): ReactElement {
  return (
    <section {...data} {...stylex.props(styles.group)}>
      {title === undefined ? null : (
        <div {...stylex.props(styles.groupHead)}>
          <h3 {...stylex.props(styles.groupTitle)}>{title}</h3>
          {info === undefined ? null : <InfoTip label={info} />}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusList({
  data,
  children,
}: {
  data?: Record<`data-${string}`, string>;
  children: ReactNode[];
}): ReactElement {
  const rows = children.filter((child) => child !== null && child !== undefined && child !== false);
  return (
    <div {...data} {...stylex.props(styles.list)}>
      {rows.map((row, index) => (
        <div key={index}>
          {index === 0 ? null : <div aria-hidden="true" {...stylex.props(styles.divider)} />}
          {row}
        </div>
      ))}
    </div>
  );
}

export function StatusListRow({
  icon,
  tone = 'neutral',
  title,
  meta,
  info,
  action,
  open,
  onToggle,
  toggleLabel,
  data,
  children,
}: {
  icon?: string;
  tone?: StatusTone;
  title: string;
  meta?: ReactNode;
  info?: string;
  action?: ReactNode;
  open?: boolean;
  onToggle?(): void;
  toggleLabel?: string;
  data?: Record<`data-${string}`, string | undefined>;
  children?: ReactNode;
}): ReactElement {
  return (
    <div {...data}>
      <div {...stylex.props(styles.row)}>
        {icon === undefined ? null : <StatusBadge icon={icon} tone={tone} />}
        <div {...stylex.props(styles.grow)}>
          <span {...stylex.props(styles.groupHead)}>
            <span {...stylex.props(styles.rowTitle)}>{title}</span>
            {info === undefined ? null : <InfoTip label={info} />}
          </span>
          {meta === undefined ? null : (
            <span {...stylex.props(styles.rowMeta, tone === 'warning' && styles.rowWarning)}>
              {meta}
            </span>
          )}
        </div>
        <div {...stylex.props(styles.rowEnd)}>
          {action}
          {onToggle === undefined ? null : (
            <button
              type="button"
              aria-expanded={open === true}
              aria-label={toggleLabel}
              onClick={onToggle}
              {...stylex.props(styles.toggle)}
            >
              <span {...stylex.props(styles.chevron, open === true && styles.chevronOpen)}>
                <ChannelSidebarIcon name="chevron-right" size={16} />
              </span>
            </button>
          )}
        </div>
      </div>
      {open === true && children !== undefined ? (
        <div {...stylex.props(styles.rowDetails)}>{children}</div>
      ) : null}
    </div>
  );
}

export function StatusListAction({
  icon = 'plus',
  label,
  onClick,
  data,
}: {
  icon?: string;
  label: string;
  onClick(): void;
  data?: Record<`data-${string}`, string>;
}): ReactElement {
  return (
    <button
      type="button"
      {...data}
      onClick={onClick}
      {...stylex.props(styles.row, styles.rowButton)}
    >
      <StatusBadge icon={icon} tone="accent" />
      <span {...stylex.props(styles.rowTitle)}>{label}</span>
    </button>
  );
}

import * as stylex from '@stylexjs/stylex';
import type { ReactElement, ReactNode } from 'react';

import { Button } from './button.js';
import { dimension } from './dimensions.stylex.js';
import { accent } from './tobs.stylex.js';
import { border, color, radius, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${dimension.catalogCardMinWidth}), 1fr))`,
    alignContent: 'start',
    gap: space.x3,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: space.x2,
    minWidth: 0,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    paddingBlockStart: space.x4,
    paddingBlockEnd: 0,
    paddingInline: space.x4,
  },
  open: {
    margin: 0,
    borderWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: `calc(-1 * ${border.focus})`,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  title: {
    overflow: 'hidden',
    color: color.fg,
    fontSize: text.titleSize,
    fontWeight: text.strong,
    lineHeight: text.bodyLine,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  titleHover: {
    textDecoration: { default: 'none', ':is(button:hover:enabled *)': 'underline' },
  },
  subtitle: {
    overflow: 'hidden',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  summary: {
    display: '-webkit-box',
    marginBlock: 0,
    marginInline: space.x4,
    overflow: 'hidden',
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  foot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
    paddingBlockStart: space.x2,
    paddingBlockEnd: space.x4,
    paddingInline: space.x4,
  },
  meta: {
    overflow: 'hidden',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export function CatalogGrid({
  label,
  children,
  data,
}: {
  label: string;
  children: ReactNode;
  data?: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  return (
    <ul aria-label={label} {...data} {...stylex.props(styles.grid)}>
      {children}
    </ul>
  );
}

export function CatalogCard({
  title,
  subtitle,
  summary,
  meta,
  leading,
  actionLabel,
  disabled,
  onClick,
  data,
}: {
  title: string;
  subtitle?: string | undefined;
  summary?: string | undefined;
  meta?: ReactNode;
  leading?: ReactNode;
  actionLabel?: string | undefined;
  disabled?: boolean;
  onClick: () => void;
  data?: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  const head = (
    <>
      {leading}
      <span {...stylex.props(styles.copy)}>
        <span {...stylex.props(styles.title, actionLabel === undefined && styles.titleHover)}>
          {title}
        </span>
        {subtitle === undefined ? null : <span {...stylex.props(styles.subtitle)}>{subtitle}</span>}
      </span>
    </>
  );
  return (
    <li {...data} {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.body)}>
        {actionLabel === undefined ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            {...stylex.props(styles.head, styles.open)}
          >
            {head}
          </button>
        ) : (
          <div {...stylex.props(styles.head)}>{head}</div>
        )}
        {summary === undefined ? null : <p {...stylex.props(styles.summary)}>{summary}</p>}
      </div>
      {meta === undefined && actionLabel === undefined ? null : (
        <div {...stylex.props(styles.foot)}>
          <span {...stylex.props(styles.meta)}>{meta}</span>
          {actionLabel === undefined ? null : (
            <Button
              size="sm"
              variant="primary"
              disabled={disabled}
              aria-label={`${actionLabel} ${title}`}
              onClick={onClick}
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

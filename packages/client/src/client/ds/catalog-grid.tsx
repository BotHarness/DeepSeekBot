import * as stylex from '@stylexjs/stylex';
import type { ReactElement, ReactNode } from 'react';

import { Button } from './button.js';
import { dimension } from './dimensions.stylex.js';
import { color, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${dimension.catalogCardMinWidth}, 1fr))`,
    gap: space.x4,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: { display: 'flex', minWidth: 0 },
  card: {
    width: '100%',
    height: 'auto',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: space.x4,
    paddingBlock: space.x4,
    paddingInline: space.x4,
    whiteSpace: 'normal',
    textAlign: 'start',
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    flexGrow: 1,
  },
  title: { fontWeight: text.strong },
  summary: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
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
  summary,
  meta,
  leading,
  trailing,
  disabled,
  onClick,
  data,
}: {
  title: string;
  summary?: string | undefined;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  data?: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  return (
    <li {...stylex.props(styles.item)}>
      <Button
        {...data}
        variant="outline"
        disabled={disabled}
        onClick={onClick}
        xstyle={styles.card}
      >
        {leading}
        <span {...stylex.props(styles.copy)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          {summary === undefined ? null : <span {...stylex.props(styles.summary)}>{summary}</span>}
          {meta === undefined ? null : <span {...stylex.props(styles.meta)}>{meta}</span>}
        </span>
        {trailing}
      </Button>
    </li>
  );
}

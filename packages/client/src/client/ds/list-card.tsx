import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button } from './button.js';
import { edge, ink, state, style, type as typeScale } from './tobs.stylex.js';
import { space } from './tokens.stylex.js';

const inline = `calc(${style.listGroupPaddingInline} + ${style.listItemPadding})`;

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: style.listGap,
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    borderRadius: style.listGroupRadius,
    overflow: 'clip',
    backgroundColor: style.listGroupFill,
    boxShadow: `0 0 0 calc(${edge.hairline} / 2) ${style.listGroupEdge}`,
  },
  item: {
    position: 'relative',
    minWidth: 0,
    backgroundColor: style.listItemFill,
    backgroundImage: 'none',
    borderStartStartRadius: {
      default: style.listItemRadius,
      ':first-child': style.listGroupRadius,
    },
    borderStartEndRadius: { default: style.listItemRadius, ':first-child': style.listGroupRadius },
    borderEndStartRadius: { default: style.listItemRadius, ':last-child': style.listGroupRadius },
    borderEndEndRadius: { default: style.listItemRadius, ':last-child': style.listGroupRadius },
    borderTopWidth: edge.hairline,
    borderTopStyle: 'solid',
    borderTopColor: { default: style.listSeparator, ':first-child': 'transparent' },
    paddingTop: { default: 0, ':first-child': style.listGroupPaddingBlock },
    paddingBottom: { default: 0, ':last-child': style.listGroupPaddingBlock },
  },
  interactive: {
    backgroundImage: {
      default: 'none',
      ':hover': `linear-gradient(${state.hover}, ${state.hover})`,
    },
  },
  line: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    paddingInline: inline,
    paddingBlock: style.listItemPaddingBlock,
  },
  leading: { display: 'grid', placeItems: 'center', flexShrink: 0 },
  body: { display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 },
  title: {
    minWidth: 0,
    color: ink.primary,
    fontSize: typeScale.bodySize,
    lineHeight: typeScale.bodyLine,
    fontWeight: typeScale.labelWeight,
    overflowWrap: 'anywhere',
  },
  summary: {
    minWidth: 0,
    color: ink.secondary,
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    overflowWrap: 'anywhere',
  },
  trailing: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    maxWidth: '60%',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    color: ink.secondary,
  },
  detail: { paddingInline: inline, paddingBottom: style.listItemPaddingBlock },
});

export const aboveListToggle = stylex.create({
  raised: { position: 'relative', zIndex: 1 },
}).raised;

export function ListCard({
  label,
  children,
}: {
  label?: string | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <ul aria-label={label} {...stylex.props(styles.card)} data-list-card="">
      {children}
    </ul>
  );
}

export interface ListCardToggle {
  label: string;
  expanded: boolean;
  controls?: string | undefined;
  onToggle(): void;
}

export function ListCardItem({
  leading,
  title,
  summary,
  trailing,
  detail,
  detailId,
  toggle,
  action,
  data,
}: {
  leading?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  trailing?: ReactNode;
  detail?: ReactNode;
  detailId?: string | undefined;
  data?: Record<`data-${string}`, string | undefined>;
} & (
  | { toggle?: ListCardToggle | undefined; action?: never }
  | { toggle?: never; action: { label: string; disabled?: boolean; onClick(): void } }
)): ReactElement {
  const trigger = toggle ?? action;
  return (
    <li {...data} {...stylex.props(styles.item, trigger !== undefined && styles.interactive)}>
      <div {...stylex.props(styles.line)}>
        {trigger === undefined ? null : (
          <Button
            type="button"
            variant="overlay"
            aria-label={trigger.label}
            aria-expanded={toggle?.expanded}
            aria-controls={toggle?.controls}
            disabled={action?.disabled}
            onClick={toggle?.onToggle ?? action?.onClick}
          />
        )}
        {leading === undefined ? null : <span {...stylex.props(styles.leading)}>{leading}</span>}
        <span {...stylex.props(styles.body)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          {summary === undefined ? null : <span {...stylex.props(styles.summary)}>{summary}</span>}
        </span>
        {trailing === undefined ? null : <span {...stylex.props(styles.trailing)}>{trailing}</span>}
      </div>
      {detail === undefined ? null : (
        <div id={detailId} {...stylex.props(styles.detail)}>
          {detail}
        </div>
      )}
    </li>
  );
}

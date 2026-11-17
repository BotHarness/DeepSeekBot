import { forwardRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { QuoteIcon } from '../quote-icon.js';
import { border, color, radius, space, text } from './tokens.stylex.js';
import { state, style } from './tobs.stylex.js';

const tint = (percent: number) => `color-mix(in srgb, currentColor ${percent}%, transparent)`;

const styles = stylex.create({
  chipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
    minWidth: 0,
    margin: 0,
    paddingBlock: `0 ${space.x2}`,
    paddingInline: 0,
    listStyle: 'none',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    maxWidth: 'min(100%, 280px)',
    minHeight: style.chipHeight,
    boxSizing: 'border-box',
    paddingBlock: 0,
    paddingInlineStart: space.x2,
    paddingInlineEnd: space.x1,
    borderRadius: style.radiusChip,
    backgroundColor: state.pressed,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  icon: { display: 'inline-flex', flexShrink: 0 },
  author: {
    flexShrink: 0,
    maxWidth: '96px',
    overflow: 'hidden',
    color: color.fg,
    fontWeight: text.strong,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  excerpt: {
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  remove: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '20px',
    height: '20px',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.round,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: 'inherit', ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    marginBlock: `0 ${space.x2}`,
    marginInline: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: space.x2,
    rowGap: space.x1,
    alignItems: 'start',
    width: '100%',
    boxSizing: 'border-box',
    paddingBlock: space.x1,
    paddingInlineStart: space.x2,
    paddingInlineEnd: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.xs,
    backgroundColor: { default: tint(13), ':hover': tint(20) },
    color: color.accentText,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid currentColor` },
    outlineOffset: '2px',
  },
  cardMine: { color: 'inherit' },
  cardMuted: {
    backgroundColor: tint(13),
    color: color.muted,
    cursor: 'default',
  },
  cardIcon: { display: 'inline-flex', gridRow: '1 / span 2' },
  cardAuthor: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontWeight: text.strong,
  },
  cardBody: {
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    color: color.fg,
    opacity: 0.9,
    overflowWrap: 'anywhere',
  },
  cardBodyMine: { color: 'inherit' },
  cardBodyPart: { fontStyle: 'italic' },
});

export function QuoteChipList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <ul aria-label={label} data-quote-chips="" {...stylex.props(styles.chipList)}>
      {children}
    </ul>
  );
}

export function QuoteChip({
  author,
  excerpt,
  part,
  removeLabel,
  disabled,
  onRemove,
}: {
  readonly author: string;
  readonly excerpt: string;
  readonly part: boolean;
  readonly removeLabel: string;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}) {
  return (
    <li
      title={`${author}: ${excerpt}`}
      data-quote-chip=""
      data-quote-part={part ? '' : undefined}
      {...stylex.props(styles.chip)}
    >
      <span aria-hidden="true" {...stylex.props(styles.icon)}>
        <QuoteIcon size={14} />
      </span>
      <span {...stylex.props(styles.author)}>{author}</span>
      <span {...stylex.props(styles.excerpt)}>{excerpt}</span>
      <button
        type="button"
        aria-label={removeLabel}
        disabled={disabled}
        onClick={onRemove}
        {...stylex.props(styles.remove)}
      >
        &times;
      </button>
    </li>
  );
}

export function QuoteCardList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <ul aria-label={label} data-bubble-quotes="" {...stylex.props(styles.cardList)}>
      {children}
    </ul>
  );
}

export const QuoteCard = forwardRef<
  HTMLButtonElement,
  {
    readonly author?: string;
    readonly body: string;
    readonly part: boolean;
    readonly mine: boolean;
    readonly kind: string;
    readonly jumpLabel?: string;
    readonly onJump?: () => void;
  }
>(function QuoteCard({ author, body, part, mine, kind, jumpLabel, onJump }, ref) {
  const content = (
    <>
      <span aria-hidden="true" {...stylex.props(styles.cardIcon)}>
        <QuoteIcon size={14} />
      </span>
      {author === undefined ? null : <span {...stylex.props(styles.cardAuthor)}>{author}</span>}
      <span
        {...stylex.props(styles.cardBody, mine && styles.cardBodyMine, part && styles.cardBodyPart)}
      >
        {body}
      </span>
    </>
  );
  if (onJump === undefined)
    return (
      <li data-bubble-quote="unavailable" {...stylex.props(styles.card, styles.cardMuted)}>
        {content}
      </li>
    );
  return (
    <li>
      <button
        ref={ref}
        type="button"
        aria-label={jumpLabel}
        data-bubble-quote={kind}
        data-quote-part={part ? '' : undefined}
        onClick={onJump}
        {...stylex.props(
          styles.card,
          mine && styles.cardMine,
          kind === 'other' && styles.cardMuted,
        )}
      >
        {content}
      </button>
    </li>
  );
});

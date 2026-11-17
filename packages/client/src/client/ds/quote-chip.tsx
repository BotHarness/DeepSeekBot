import { forwardRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { QuoteIcon } from '../quote-icon.js';
import { border, color, radius, space, text } from './tokens.stylex.js';
import { state, style } from './tobs.stylex.js';

const tint = (percent: number) => `color-mix(in srgb, currentColor ${percent}%, transparent)`;

const styles = stylex.create({
  chipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    margin: 0,
    paddingBlock: `0 ${space.x2}`,
    paddingInline: 0,
    listStyle: 'none',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
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
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '45%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  note: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: '96px',
    height: style.chipHeight,
    boxSizing: 'border-box',
    marginInlineStart: space.x1,
    paddingBlock: 0,
    paddingInline: space.x2,
    borderWidth: 0,
    borderInlineStartWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    '::placeholder': { color: color.subtle },
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
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
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
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid currentColor`,
    },
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
  quoteItem: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  cardNote: {
    display: 'flex',
    margin: 0,
    alignItems: 'baseline',
    gap: space.x1,
    minWidth: 0,
    paddingInlineStart: space.x2,
    color: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  cardNoteMark: { flexShrink: 0, opacity: 0.6 },
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
  note,
  noteLabel,
  notePlaceholder,
  removeLabel,
  disabled,
  onNoteChange,
  onRemove,
}: {
  readonly author: string;
  readonly excerpt: string;
  readonly part: boolean;
  readonly note: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly removeLabel: string;
  readonly disabled?: boolean;
  readonly onNoteChange: (note: string) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li data-quote-chip="" data-quote-part={part ? '' : undefined} {...stylex.props(styles.chip)}>
      <span aria-hidden="true" {...stylex.props(styles.icon)}>
        <QuoteIcon size={14} />
      </span>
      <span {...stylex.props(styles.author)}>{author}</span>
      <span title={`${author}: ${excerpt}`} {...stylex.props(styles.excerpt)}>
        {excerpt}
      </span>
      <input
        type="text"
        value={note}
        maxLength={1000}
        aria-label={noteLabel}
        placeholder={notePlaceholder}
        disabled={disabled}
        data-quote-note=""
        onChange={(event) => onNoteChange(event.target.value)}
        {...stylex.props(styles.note)}
      />
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
    readonly media?: string | undefined;
    readonly thumb?: ReactNode | undefined;
    readonly note?: string | undefined;
    readonly noteLabel?: string;
    readonly jumpLabel?: string;
    readonly onJump?: () => void;
  }
>(function QuoteCard(
  { author, body, part, mine, kind, media, thumb, note, noteLabel, jumpLabel, onJump },
  ref,
) {
  const content = (
    <>
      <span aria-hidden="true" {...stylex.props(styles.cardIcon)}>
        {thumb ?? <QuoteIcon size={14} />}
      </span>
      {author === undefined ? null : (
        <span data-bubble-quote-author="" {...stylex.props(styles.cardAuthor)}>
          {author}
        </span>
      )}
      <span
        data-bubble-quote-body=""
        {...stylex.props(styles.cardBody, mine && styles.cardBodyMine, part && styles.cardBodyPart)}
      >
        {body}
      </span>
    </>
  );
  const reply =
    note === undefined ? null : (
      <p aria-label={noteLabel} data-bubble-quote-note="" {...stylex.props(styles.cardNote)}>
        <span aria-hidden="true" {...stylex.props(styles.cardNoteMark)}>
          ↳
        </span>
        <span>{note}</span>
      </p>
    );
  if (onJump === undefined)
    return (
      <li {...stylex.props(styles.quoteItem)}>
        <div data-bubble-quote="unavailable" {...stylex.props(styles.card, styles.cardMuted)}>
          {content}
        </div>
        {reply}
      </li>
    );
  return (
    <li {...stylex.props(styles.quoteItem)}>
      <button
        ref={ref}
        type="button"
        aria-label={jumpLabel === undefined ? undefined : `${jumpLabel}: ${body}`}
        data-bubble-quote={kind}
        data-quote-part={part ? '' : undefined}
        data-bubble-quote-media={media}
        onClick={onJump}
        {...stylex.props(
          styles.card,
          mine && styles.cardMine,
          kind === 'other' && styles.cardMuted,
        )}
      >
        {content}
      </button>
      {reply}
    </li>
  );
});

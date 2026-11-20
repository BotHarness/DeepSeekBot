import * as stylex from '@stylexjs/stylex';
import type { ReactElement, ReactNode, Ref } from 'react';

import { Button } from './button.js';
import { dimension } from './dimensions.stylex.js';
import { hooked } from './hooked.js';
import { Icon } from './icon.js';
import { Tag } from './tag.js';
import {
  accent,
  edge,
  ink,
  layer,
  size,
  space,
  state,
  status,
  style,
  type,
} from './tobs.stylex.js';

export const requestCardStyles = stylex.create({
  card: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space.x3,
    minWidth: 0,
    color: ink.primary,
    backgroundColor: layer.raised,
    borderRadius: style.radiusCard,
    overflowWrap: 'anywhere',
  },
  inset: { padding: space.x4 },
  compact: { gap: space.x2, width: 'auto' },
  approval: { minWidth: `min(${dimension.approvalCardMinWidth}, 100%)` },
  question: { width: dimension.questionCardWidth, maxWidth: '100%' },
  focus: {
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${accent.focus}` },
    outlineOffset: edge.focusOffset,
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
  },
  caption: { color: ink.secondary, fontSize: type.captionSize, lineHeight: type.captionLine },
  prompt: {
    color: ink.primary,
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
    fontWeight: type.labelWeight,
    whiteSpace: 'pre-wrap',
  },
  group: { display: 'grid', gap: space.x2, gridTemplateColumns: 'minmax(0, 1fr)' },
  summary: {
    display: 'grid',
    justifyContent: 'stretch',
    gap: space.x2,
    height: 'auto',
    minWidth: 0,
    padding: 0,
    borderRadius: style.radiusSmall,
    textAlign: 'start',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  well: {
    backgroundColor: layer.well,
    borderRadius: style.radiusContainer,
    padding: space.x3,
  },
  preview: {
    display: 'block',
    color: ink.primary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  error: { color: status.dangerInk },
  added: { color: status.successInk },
  removed: { color: status.dangerInk },
});

const detailStyles = stylex.create({
  list: { display: 'grid', gap: space.x3, margin: 0 },
  pair: { display: 'grid', gap: space.x1, minWidth: 0 },
  label: { color: ink.primary, fontWeight: type.labelWeight },
  value: { margin: 0, minWidth: 0 },
});

export function RequestDetails({ children }: { children: ReactNode }): ReactElement {
  return <dl {...stylex.props(detailStyles.list)}>{children}</dl>;
}

export function RequestDetail({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div {...stylex.props(detailStyles.pair)}>
      <dt {...stylex.props(requestCardStyles.caption, detailStyles.label)}>{label}</dt>
      <dd {...stylex.props(requestCardStyles.caption, detailStyles.value)}>{children}</dd>
    </div>
  );
}

export function RequestHeading({
  children,
  pending,
  urgent = false,
  pendingRef,
}: {
  children: ReactNode;
  pending?: ReactNode;
  urgent?: boolean;
  pendingRef?: Ref<HTMLSpanElement>;
}): ReactElement {
  return (
    <div {...hooked('bh-request-head', requestCardStyles.head)}>
      <span {...hooked('bh-request-category', requestCardStyles.caption)}>{children}</span>
      {pending === undefined ? null : (
        <Tag
          ref={pendingRef}
          tone={urgent ? 'danger' : 'warning'}
          className="bh-request-pill"
          data-state="pending"
          data-urgent={urgent || undefined}
          wrap
        >
          {pending}
        </Tag>
      )}
    </div>
  );
}

export function RequestOutcome({
  outcome,
  children,
  title,
}: {
  outcome: string;
  children: ReactNode;
  title?: string | undefined;
}): ReactElement {
  const tone =
    outcome === 'denied'
      ? 'danger'
      : outcome === 'submitted'
        ? 'warning'
        : ['allowed', 'remembered', 'answered'].includes(outcome)
          ? 'success'
          : 'neutral';
  return (
    <div role="status" className="bh-request-done" data-state={outcome} title={title}>
      <Tag tone={tone} wrap>
        {children}
      </Tag>
    </div>
  );
}

const optionStyles = stylex.create({
  list: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space.x1,
    listStyle: 'none',
    margin: 0,
    padding: space.x1,
    backgroundColor: layer.well,
    borderRadius: style.radiusContainer,
  },
  row: {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: `${size.iconSlot} minmax(0, 1fr) ${size.iconSlot}`,
    alignItems: 'center',
    justifyContent: 'stretch',
    gap: space.x2,
    width: '100%',
    height: 'auto',
    minHeight: style.controlHeightLarge,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderRadius: style.radiusSmall,
    backgroundColor: {
      default: 'transparent',
      ':hover:not(:disabled, :has(:disabled))': state.hover,
    },
    color: ink.primary,
    textAlign: 'start',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    outline: {
      default: 'none',
      ':focus-visible': `${edge.focus} solid ${accent.focus}`,
      ':has(:focus-visible)': `${edge.focus} solid ${accent.focus}`,
    },
    outlineOffset: `calc(-1 * ${edge.focusOffset})`,
  },
  selected: {
    backgroundColor: {
      default: accent.tint,
      ':hover:not(:disabled, :has(:disabled))': accent.tint,
    },
    color: accent.ink,
  },
  copy: { display: 'grid', gap: space.x1 },
  description: { fontSize: type.captionSize, lineHeight: type.captionLine },
  letter: { fontSize: type.captionSize, textAlign: 'center' },
  tapLetter: { '::before': { content: 'attr(data-letter)' } },
  disabled: { opacity: 0.5 },
  clickable: { cursor: 'pointer' },
  checkbox: {
    position: 'absolute',
    width: edge.hairline,
    height: edge.hairline,
    clipPath: 'inset(50%)',
    overflow: 'hidden',
  },
  mark: { visibility: 'hidden' },
});

export function RequestOptions({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} {...stylex.props(optionStyles.list)}>
      {children}
    </ul>
  );
}

export function RequestOption({
  letter,
  title,
  description,
  selected,
  multiple,
  disabled,
  onChoose,
}: {
  letter: string;
  title: string;
  description?: string | undefined;
  selected?: boolean | undefined;
  multiple: boolean;
  disabled: boolean;
  onChoose: () => void;
}): ReactElement {
  const row = [optionStyles.row, selected === true && optionStyles.selected];
  const content = (
    <>
      <span
        aria-hidden="true"
        data-letter={selected === undefined ? letter : undefined}
        {...hooked(
          'bh-question-letter',
          optionStyles.letter,
          selected === undefined && optionStyles.tapLetter,
        )}
      >
        {selected === undefined ? null : letter}
      </span>
      <span {...stylex.props(optionStyles.copy)}>
        <span>{title}</span>
        {description === undefined ? null : (
          <span {...stylex.props(optionStyles.description)}>{description}</span>
        )}
      </span>
      <span aria-hidden="true" {...stylex.props(selected !== true && optionStyles.mark)}>
        <Icon name="check" size={16} />
      </span>
    </>
  );
  return (
    <li>
      {multiple ? (
        <label {...stylex.props(...row, disabled ? optionStyles.disabled : optionStyles.clickable)}>
          <input
            type="checkbox"
            checked={selected === true}
            disabled={disabled}
            onChange={onChoose}
            {...stylex.props(optionStyles.checkbox)}
          />
          {content}
        </label>
      ) : (
        <Button
          type="button"
          aria-pressed={selected}
          disabled={disabled}
          onClick={onChoose}
          xstyle={row}
        >
          {content}
        </Button>
      )}
    </li>
  );
}

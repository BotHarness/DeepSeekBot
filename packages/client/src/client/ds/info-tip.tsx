import { useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { border, radius, space } from './tokens.stylex.js';
import { accent, elevation, ink, layer, style } from './tobs.stylex.js';

const styles = stylex.create({
  wrap: { position: 'relative', display: 'inline-flex', flexShrink: 0 },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: style.iconSize,
    height: style.iconSize,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: 'transparent',
    color: { default: ink.tertiary, ':hover': ink.secondary },
    cursor: 'help',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
  },
  bubble: {
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1100,
    width: 'max-content',
    maxWidth: '280px',
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: style.radiusMenu,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x2,
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: 400,
    whiteSpace: 'normal',
    pointerEvents: 'none',
  },
});

export interface InfoTipProps {
  readonly label: string;
  readonly text: string;
}

export function InfoTip({ label, text }: InfoTipProps): ReactElement {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = bubble.current;
    const trigger = anchor.current;
    if (!open || !node || !trigger) return;
    const place = () => {
      const target = trigger.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(trigger).fontSize) / 2 || 8;
      node.style.left = '0px';
      node.style.top = '0px';
      const origin = node.getBoundingClientRect();
      const left = Math.max(0, Math.min(target.left, window.innerWidth - origin.width));
      node.style.left = `${left - origin.left}px`;
      node.style.top = `${target.bottom + gap - origin.top}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return (
    <span
      ref={anchor}
      {...stylex.props(styles.wrap)}
      onPointerEnter={() => {
        setHover(true);
      }}
      onPointerLeave={() => {
        setHover(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onFocus={() => {
          setFocus(true);
        }}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
        onClick={() => {
          setPinned((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setPinned(false);
            setHover(false);
            setFocus(false);
          }
        }}
        {...stylex.props(styles.button)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 6.2v3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="7" cy="4.3" r="0.8" fill="currentColor" />
        </svg>
      </button>
      {open
        ? createPortal(
            <span ref={bubble} id={id} role="tooltip" {...stylex.props(styles.bubble)}>
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

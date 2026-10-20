import * as stylex from '@stylexjs/stylex';
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';

import { IconButton } from './ds/icon-button.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { QUICK_REACTIONS, reactedByMe } from './message-reactions-model.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelMessage, ChannelReaction } from './store.js';

const PICKER_GAP_PX = 6;
const PICKER_MARGIN_PX = 8;

const styles = stylex.create({
  picker: {
    position: 'fixed',
    zIndex: 1101,
    display: 'flex',
    gap: space.x1,
    padding: space.x2,
    '--dsw-elevation-stroke-color': color.divider,
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  pick: {
    display: 'grid',
    placeItems: 'center',
    width: size.icon,
    height: size.icon,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':focus-visible': color.hover,
    },
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  picked: {
    backgroundColor: color.selected,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
    marginTop: space.x2,
  },
  chipsMine: {
    justifyContent: 'flex-end',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.lg,
    backgroundColor: { default: color.base, ':hover': color.hover },
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  chipMine: {
    borderColor: color.accent,
    color: color.fg,
  },
  chipEmoji: {
    fontSize: text.bodySize,
    lineHeight: text.metaLine,
  },
});

export function ReactionIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.8 13.8a4 4 0 0 0 6.4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="9.4" cy="10" r="1.1" fill="currentColor" />
      <circle cx="14.6" cy="10" r="1.1" fill="currentColor" />
    </svg>
  );
}

function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
  event.preventDefault();
  next?.focus();
}

interface PickerAnchor {
  left: number;
  top: number;
  width: number;
  bottom: number;
}

export function MessageReactionSurface({
  message,
  anchor,
  owner,
  onReact,
  onClose,
  t,
}: {
  message: ChannelMessage;
  anchor(): PickerAnchor | undefined;
  owner?: () => Element | null;
  onReact(emoji: string, active: boolean): void;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const surface = useMountedResource<HTMLDivElement>((node) => {
    const bounds = node.getBoundingClientRect();
    const trigger = anchor();
    if (trigger !== undefined) {
      const left = Math.max(
        PICKER_MARGIN_PX,
        Math.min(
          trigger.left + trigger.width / 2 - bounds.width / 2,
          window.innerWidth - bounds.width - PICKER_MARGIN_PX,
        ),
      );
      const above = trigger.top - bounds.height - PICKER_GAP_PX;
      node.style.left = `${String(left)}px`;
      node.style.top = `${String(above >= PICKER_MARGIN_PX ? above : trigger.bottom + PICKER_GAP_PX)}px`;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        (node.contains(event.target) || owner?.()?.contains(event.target) === true)
      )
        return;
      closeRef.current();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    const onScroll = (): void => closeRef.current();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    node.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  const mine = new Set(
    (message.reactions ?? []).filter(reactedByMe).map((reaction) => reaction.emoji),
  );
  return createPortal(
    <MenuSurface
      ref={surface}
      role="menu"
      aria-label={t('message.react')}
      aria-orientation="horizontal"
      data-reaction-picker=""
      data-bh-appearance-owned=""
      className={stylex.props(styles.picker).className}
      style={{ left: 0, top: 0 }}
      onKeyDown={moveFocus}
    >
      {QUICK_REACTIONS.map((emoji) => {
        const picked = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            role="menuitemcheckbox"
            aria-checked={picked}
            aria-label={t('message.reaction.toggle', { emoji })}
            {...stylex.props(styles.pick, picked && styles.picked)}
            onClick={() => {
              onReact(emoji, !picked);
              closeRef.current();
            }}
          >
            {emoji}
          </button>
        );
      })}
    </MenuSurface>,
    document.body,
  );
}

export function MessageReactionPicker({
  message,
  onReact,
  t,
}: {
  message: ChannelMessage;
  onReact(emoji: string, active: boolean): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const label = t('message.react');
  return (
    <>
      <Tooltip label={label} side="top" portal delayMs={400}>
        <IconButton
          ref={anchor}
          size="inline"
          data-bubble-action=""
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          data-reaction-picker-trigger=""
          onClick={() => setOpen(!open)}
        >
          <ReactionIcon />
        </IconButton>
      </Tooltip>
      {open ? (
        <MessageReactionSurface
          message={message}
          anchor={() => anchor.current?.getBoundingClientRect()}
          owner={() => anchor.current}
          onReact={onReact}
          onClose={() => {
            setOpen(false);
            anchor.current?.focus();
          }}
          t={t}
        />
      ) : null}
    </>
  );
}

export function MessageReactionChips({
  reactions,
  mine,
  names,
  onReact,
  t,
}: {
  reactions: readonly ChannelReaction[];
  mine: boolean;
  names(actor: ChannelReaction['actors'][number]): string;
  onReact?: ((emoji: string, active: boolean) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const rowMount = useMountedResource<HTMLDivElement>((node) => {
    const wrap = node.closest<HTMLElement>('.bh-bubble-wrap');
    if (wrap === null) return;
    const measure = (): void => {
      const margin = Number.parseFloat(getComputedStyle(node).marginTop) || 0;
      wrap.style.setProperty(
        '--bh-reaction-row',
        `${String(node.getBoundingClientRect().height + margin)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      wrap.style.removeProperty('--bh-reaction-row');
    };
  }, []);
  if (reactions.length === 0) return null;
  return (
    <div
      ref={rowMount}
      role="group"
      aria-label={t('message.reactions')}
      data-message-reactions=""
      {...stylex.props(styles.chips, mine && styles.chipsMine)}
    >
      {reactions.map((reaction) => {
        const pressed = reactedByMe(reaction);
        const who = reaction.actors.map(names).join(t('message.reaction.separator'));
        const label = t('message.reaction.summary', {
          emoji: reaction.emoji,
          names: who,
        });
        return (
          <Tooltip key={reaction.emoji} label={label} side="top" portal delayMs={400}>
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={label}
              disabled={onReact === undefined}
              data-reaction={reaction.emoji}
              {...stylex.props(styles.chip, pressed && styles.chipMine)}
              onClick={() => onReact?.(reaction.emoji, !pressed)}
            >
              <span aria-hidden="true" {...stylex.props(styles.chipEmoji)}>
                {reaction.emoji}
              </span>
              <span aria-hidden="true">{reaction.actors.length}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

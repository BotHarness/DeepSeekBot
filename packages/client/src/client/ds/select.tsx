import { PointerMenu, type MenuPoint } from './pointer-menu.js';
import { useMountedResource } from '../mounted-resource.js';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { pillStyles } from './pill-button.js';
import { color, space } from './tokens.stylex.js';

const styles = stylex.create({
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
});

export interface SelectOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
}

export interface SelectProps<Value extends string> {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly SelectOption<Value>[];
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
  readonly align?: 'start' | 'end';
  readonly autoFocus?: boolean;
  readonly reselect?: boolean;
}

export function Select<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  align = 'end',
  autoFocus = false,
  reselect = false,
}: SelectProps<Value>): ReactElement {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<MenuPoint>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const active = open && !disabled;
  const mount = useMountedResource<HTMLButtonElement>(
    (node) => {
      trigger.current = node;
      if (!active)
        return () => {
          trigger.current = null;
        };
      const place = () => {
        const rect = node.getBoundingClientRect();
        const scale = node.offsetHeight > 0 ? rect.height / node.offsetHeight : 1;
        const next = {
          x: align === 'end' ? rect.right : rect.left,
          y: rect.bottom + Number.parseFloat(space.x2) * scale,
        };
        setPoint((previous) => (previous?.x === next.x && previous.y === next.y ? previous : next));
      };
      place();
      const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
      resize?.observe(node);
      resize?.observe(document.documentElement);
      const observer = new MutationObserver(place);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'data-fullscreen'],
      });
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        trigger.current = null;
        resize?.disconnect();
        observer.disconnect();
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    },
    [active, align],
  );
  const close = () => {
    const button = trigger.current;
    const menu = document.activeElement?.closest('[data-pointer-menu]');
    setOpen(false);
    setPoint(undefined);
    queueMicrotask(() => {
      const focused = document.activeElement;
      if (
        button?.isConnected &&
        !button.disabled &&
        (focused === document.body || (focused !== null && menu?.contains(focused)))
      )
        button.focus({ preventScroll: true });
    });
  };
  const current = options.find((option) => option.value === value);
  return (
    <>
      <button
        ref={mount}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={active}
        disabled={disabled}
        data-modal-autofocus={autoFocus ? '' : undefined}
        onPointerDown={(event) => {
          if (active) event.stopPropagation();
        }}
        onClick={() => {
          if (active) close();
          else setOpen(true);
        }}
        {...stylex.props(pillStyles.pill)}
      >
        <span {...stylex.props(styles.label)}>{current?.label}</span>
        <span {...stylex.props(styles.chevron)}>
          <IconChevronDownOutlineRegular size={12} />
        </span>
      </button>
      {active && point ? (
        <PointerMenu
          point={point}
          align={align}
          container={trigger.current?.closest('[role="dialog"]') ?? document.body}
          autoFocus
          anchor={<span aria-hidden="true" />}
          items={options.map((option) => ({ id: option.value, label: option.label }))}
          selectedId={value}
          onSelect={(id) => {
            close();
            const next = options.find((option) => option.value === id);
            if (next !== undefined && (reselect || next.value !== value)) onChange(next.value);
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

import { PointerMenu } from './ds/pointer-menu.js';
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export function usePanelMenu({
  items,
  onSelect,
  keepOpen = false,
}: {
  items: readonly MenuEntry[];
  onSelect(id: string): void;
  keepOpen?: boolean;
}) {
  const [point, setPoint] = useState<{ x: number; y: number }>();
  const trigger = useRef<HTMLElement | null>(null);
  const close = () => {
    setPoint(undefined);
    const target = trigger.current;
    const closingMenu = document.activeElement?.closest('[data-pointer-menu]');
    queueMicrotask(() => {
      const active = document.activeElement;
      if (
        trigger.current === target &&
        target?.isConnected &&
        (active === document.body || (active !== null && closingMenu?.contains(active)))
      )
        target.focus({ preventScroll: true });
    });
  };
  const open = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    trigger.current = event.currentTarget;
    const box = event.currentTarget.getBoundingClientRect();
    setPoint(
      'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: box.left, y: box.bottom },
    );
  };
  return {
    triggerProps: {
      tabIndex: 0,
      onContextMenu: open,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event);
      },
    },
    menu: point ? (
      <PointerMenu
        point={point}
        dense
        autoFocus
        anchor={<span aria-hidden="true" />}
        items={items}
        onSelect={(id) => {
          if (!keepOpen) close();
          onSelect(id);
        }}
        onClose={close}
      />
    ) : null,
  };
}

export function PanelVisibilityLabel({
  label,
  checked,
  t,
}: {
  label: string;
  checked: boolean;
  t: BotHarnessTranslate;
}) {
  return (
    <span {...stylex.props(styles.label)}>
      <span>{label}</span>
      <span
        role="img"
        aria-label={t(checked ? 'workspace.controlShown' : 'workspace.controlHidden')}
        data-control-checked={checked}
        {...stylex.props(styles.checkbox, checked && styles.checked)}
      >
        {checked && <ChannelSidebarIcon name="check" size={12} />}
      </span>
    </span>
  );
}
const styles = stylex.create({
  label: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x5,
    width: '100%',
  },
  checkbox: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: text.metaLine,
    height: text.metaLine,
    boxSizing: 'border-box',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.borderStrong,
    borderRadius: radius.xs,
  },
  checked: { backgroundColor: color.accentTint, color: color.accent, borderColor: color.accent },
});

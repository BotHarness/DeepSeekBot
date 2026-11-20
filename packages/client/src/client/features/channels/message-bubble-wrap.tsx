import { Icon } from '../../ds/icon.js';
import { BubbleHoveredContext } from '../../bubble-toolbar.js';
import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ChannelMessage } from '../../store.js';
import { useMessageSelection } from '../../message-selection.js';
import { selectableMessage } from '../../message-selection-state.js';
import { useMountedResource } from '../../mounted-resource.js';
import { observeSingleLineBubble } from '../../bubble-line.js';

const BUBBLE_LONG_PRESS_MS = 500;
const BUBBLE_LONG_PRESS_TOLERANCE_PX = 10;

export function MessageBubbleWrap({
  message,
  entering = false,
  focused,
  onContextMenu,
  children,
}: {
  message: ChannelMessage;
  entering?: boolean;
  focused: boolean;
  onContextMenu(message: ChannelMessage, x: number, y: number): void;
  children?: ReactNode;
}): ReactElement {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | undefined>(undefined);
  const fired = useRef(false);
  const selection = useMessageSelection();
  const selectable = selection !== undefined && selectableMessage(message);
  const checked = selection?.selected.has(message.id) === true;
  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);
  const mount = useMountedResource<HTMLDivElement>((node) => {
    const unobserve = observeSingleLineBubble(node);
    return () => {
      unobserve?.();
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, []);
  const [hovered, setHovered] = useState(false);
  const hover = hovered ? undefined : () => setHovered(true);
  const cancel = (): void => {
    clearTimer();
    origin.current = undefined;
  };
  return (
    <div
      ref={mount}
      onPointerMove={hover}
      onFocus={hover}
      className={`bh-bubble-wrap${entering ? ' bh-bubble-enter' : ''}${focused ? ' bh-bubble-focused' : ''}${message.failed === undefined ? '' : ' bh-bubble-wrap-failed'}${selection?.active === true ? ' bh-bubble-selecting' : ''}`}
      data-message-id={message.id}
      {...(selection?.active === true && selectable
        ? {
            role: 'checkbox',
            'aria-checked': checked,
            tabIndex: 0,
            'data-selected': checked ? 'true' : 'false',
          }
        : {})}
      onContextMenu={(event) => {
        event.preventDefault();
        if (selection?.active === true) return;
        onContextMenu(message, event.clientX, event.clientY);
      }}
      onClickCapture={(event) => {
        if (selection?.active !== true) return;
        event.preventDefault();
        event.stopPropagation();
        selection.toggle(message);
      }}
      onKeyDown={(event) => {
        if (selection?.active !== true || event.target !== event.currentTarget) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          selection.toggle(message);
        }
      }}
      onTouchStart={(event) => {
        if (event.touches.length !== 1) {
          cancel();
          return;
        }
        const touch = event.touches[0];
        if (touch === undefined) {
          cancel();
          return;
        }
        const x = touch.clientX;
        const y = touch.clientY;
        clearTimer();
        origin.current = { x, y };
        fired.current = false;
        timer.current = setTimeout(() => {
          timer.current = undefined;
          fired.current = true;
          try {
            if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
          } catch {}
          if (selection?.active === true) return;
          onContextMenu(message, x, y);
        }, BUBBLE_LONG_PRESS_MS);
      }}
      onTouchMove={(event) => {
        const start = origin.current;
        const touch = event.touches[0];
        if (start === undefined || touch === undefined || timer.current === undefined) return;
        if (
          Math.abs(touch.clientX - start.x) > BUBBLE_LONG_PRESS_TOLERANCE_PX ||
          Math.abs(touch.clientY - start.y) > BUBBLE_LONG_PRESS_TOLERANCE_PX
        )
          cancel();
      }}
      onTouchEnd={(event) => {
        const wasFired = fired.current;
        cancel();
        fired.current = false;
        if (wasFired) event.preventDefault();
      }}
      onTouchCancel={() => {
        cancel();
        fired.current = false;
      }}
    >
      {selection?.active === true && selectable ? (
        <span className="bh-bubble-check" aria-hidden="true" data-checked={checked}>
          {checked ? <Icon name="check" size={12} /> : null}
        </span>
      ) : null}
      <BubbleHoveredContext.Provider value={hovered}>{children}</BubbleHoveredContext.Provider>
    </div>
  );
}

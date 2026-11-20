import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ChannelDragProps } from './channel-drag.js';

export interface RowCallbacks<Menu> {
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onMenu: (request: Menu) => void;
  onPinDragStart?: ((channelId: string) => void) | undefined;
  onPinDragEnd?: (() => void) | undefined;
  drag?: ChannelDragProps | undefined;
}

export interface RowLatest<Menu> {
  current: Map<string, RowCallbacks<Menu>>;
}

export function sameSidebarRowProps(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): boolean {
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const before = previous[key];
    const after = next[key];
    if (key !== 't' && typeof before === 'function' && typeof after === 'function') continue;
    if (key === 'drag' && before !== undefined && after !== undefined) {
      const left = before as ChannelDragProps;
      const right = after as ChannelDragProps;
      if (
        left.active !== right.active ||
        left.source !== right.source ||
        left.marker !== right.marker
      )
        return false;
      continue;
    }
    if (!Object.is(before, after)) return false;
  }
  return true;
}

export function liveRowCallbacks<Menu, P extends RowCallbacks<Menu>>(
  props: P,
  latest: RowLatest<Menu>,
  key: string,
): P {
  const live = (): RowCallbacks<Menu> => latest.current.get(key) ?? props;
  const drag = props.drag;
  return {
    ...props,
    onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => live().onActivate(event),
    onMenu: (request: Menu) => live().onMenu(request),
    onPinDragStart:
      props.onPinDragStart === undefined
        ? undefined
        : (channelId: string) => live().onPinDragStart?.(channelId),
    onPinDragEnd: props.onPinDragEnd === undefined ? undefined : () => live().onPinDragEnd?.(),
    drag:
      drag === undefined
        ? undefined
        : {
            ...drag,
            start: () => live().drag?.start(),
            hover: (half: 'before' | 'after') => live().drag?.hover(half),
            drop: (half: 'before' | 'after') => live().drag?.drop(half),
            end: () => live().drag?.end(),
          },
  };
}

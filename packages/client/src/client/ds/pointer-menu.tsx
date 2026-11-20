import { Menu } from '../appearance-primitives.js';
import type { ComponentProps } from 'react';
import { space } from './tokens.stylex.js';

export interface MenuPoint {
  readonly x: number;
  readonly y: number;
}

export function pointerMenuPosition(
  point: MenuPoint,
  width: number,
  height: number,
  viewport: { width: number; height: number; top: number },
) {
  const margin = Number.parseFloat(space.x4);
  return {
    x: Math.max(margin, Math.min(point.x, viewport.width - width - margin)),
    y: Math.max(
      Math.max(margin, viewport.top),
      Math.min(point.y, viewport.height - height - margin),
    ),
  };
}

type PointerMenuProps = Omit<
  ComponentProps<typeof Menu>,
  'open' | 'portal' | 'anchorRef' | 'side' | 'align' | 'className' | 'point'
> & { point: MenuPoint; container?: Element; align?: 'start' | 'end' };

export function PointerMenu({ point, container, align = 'start', ...props }: PointerMenuProps) {
  return <Menu {...props} open point={point} align={align} portal container={container} />;
}

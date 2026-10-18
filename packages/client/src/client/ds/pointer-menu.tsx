import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { useMountedResource } from '../mounted-resource.js';
import { border, space } from './tokens.stylex.js';

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
  'open' | 'portal' | 'getAnchorRect' | 'side' | 'align' | 'className'
> & { point: MenuPoint };

export function PointerMenu({ point, ...props }: PointerMenuProps) {
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const menu = node.querySelector<HTMLElement>('[role="menu"]');
      if (!menu) return;
      const originalMaxWidth = Number.parseFloat(getComputedStyle(menu).maxWidth);
      const place = () => {
        const scale = node.getBoundingClientRect();
        if (!scale.width || !scale.height) return;
        const root = document.documentElement;
        const clearance = root.hasAttribute('data-fullscreen')
          ? 0
          : Number.parseFloat(
              getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance'),
            ) || 0;
        const margin = Number.parseFloat(space.x4);
        menu.style.maxWidth = `${Math.min(originalMaxWidth || Infinity, (innerWidth - 2 * margin) / scale.width)}px`;
        menu.style.maxHeight = `${Math.max(0, innerHeight - Math.max(margin, clearance) - margin) / scale.height}px`;
        const box = menu.getBoundingClientRect();
        const desired = pointerMenuPosition(point, box.width, box.height, {
          width: innerWidth,
          height: innerHeight,
          top: clearance,
        });
        const left = Number.parseFloat(node.style.left) || 0;
        const top = Number.parseFloat(node.style.top) || 0;
        node.style.left = `${left + (desired.x - box.left) / scale.width}px`;
        node.style.top = `${top + (desired.y - box.top) / scale.height}px`;
      };
      place();
      const observer =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
      observer?.observe(menu);
      observer?.observe(node);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        observer?.disconnect();
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    },
    [point.x, point.y],
  );
  return createPortal(
    <span ref={mount} data-pointer-menu="" {...stylex.props(styles.origin)}>
      <Menu {...props} open portal={false} className={stylex.props(styles.menu).className} />
    </span>,
    document.body,
  );
}

const styles = stylex.create({
  origin: {
    position: 'fixed',
    left: 0,
    top: 0,
    width: border.hairline,
    height: border.hairline,
    zIndex: 1100,
    pointerEvents: 'none',
  },
  menu: { pointerEvents: 'auto' },
});

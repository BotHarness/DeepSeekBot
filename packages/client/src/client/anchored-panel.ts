import * as native from '@deepseek-ai/dsh-client-ui-primitives';
import { useId, useLayoutEffect, type CSSProperties, type RefObject } from 'react';

const useLegacyPosition = 'useAnchoredPosition' in native ? native.useAnchoredPosition : undefined;

export function useAnchoredPanel({
  open,
  anchorRef,
  panelRef,
  gap,
  margin,
  matchWidth = false,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  gap: number;
  margin: number;
  matchWidth?: boolean;
}): CSSProperties {
  const position = useLegacyPosition?.({ open, anchorRef, panelRef, gap, margin });
  const id = useId();
  const name = `--bh-panel-${id.replace(/[^a-zA-Z0-9_-]/gu, '')}`;
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (useLegacyPosition !== undefined || !open || anchor === null) return;
    const previous = anchor.style.getPropertyValue('anchor-name');
    const priority = anchor.style.getPropertyPriority('anchor-name');
    anchor.style.setProperty('anchor-name', name);
    return () => anchor.style.setProperty('anchor-name', previous, priority);
  }, [open, anchorRef, name]);
  if (useLegacyPosition !== undefined) {
    return {
      ...position,
      ...(matchWidth ? { width: anchorRef.current?.getBoundingClientRect().width ?? 200 } : {}),
      visibility: position === null ? 'hidden' : undefined,
    };
  }
  return {
    position: 'fixed',
    positionAnchor: name,
    top: `max(${margin}px, var(--dsh-frame-overlay-top, ${margin}px), calc(anchor(bottom) + ${gap}px))`,
    bottom: margin,
    left: `max(${margin}px, anchor(left))`,
    right: margin,
    alignSelf: 'start',
    justifySelf: 'start',
    margin: 0,
    height: 'fit-content',
    maxWidth: `calc(100vw - ${margin * 2}px)`,
    positionTryFallbacks: 'flip-block, flip-inline, flip-block flip-inline',
    ...(matchWidth ? { width: `min(anchor-size(width), calc(100vw - ${margin * 2}px))` } : {}),
  };
}

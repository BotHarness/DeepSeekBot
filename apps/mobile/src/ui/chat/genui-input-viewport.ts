import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { Keyboard, type ViewInstance } from 'react-native';

import { space } from '../design/tokens';

type MeasuredView = Pick<ViewInstance, 'measureInWindow'>;
export type GenuiInputBounds = { top: number; height: number };
export type GenuiInputViewport = (node: MeasuredView, bounds: GenuiInputBounds | undefined) => void;

export function inputRevealDelta(top: number, height: number, start: number, end: number): number {
  if (end <= start) return 0;
  if (top < start) return top - start;
  return Math.max(0, top + Math.min(height, end - start) - end);
}

export function useGenuiInputViewport(
  composer: RefObject<MeasuredView | null>,
  reveal: (delta: number) => void,
  start: number,
  enabled: boolean,
  scope: string,
) {
  const selected = useRef<{ node: MeasuredView; bounds: GenuiInputBounds } | undefined>(undefined);
  const pending = useRef<number | undefined>(undefined);
  const current = useRef({ enabled, start, reveal });
  current.current = { enabled, start, reveal };
  const measure = useCallback(() => {
    if (pending.current !== undefined) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = undefined;
      const input = selected.current;
      if (!input || !current.current.enabled || !Keyboard.isVisible()) return;
      composer.current?.measureInWindow((_x, bottom) => {
        input.node.measureInWindow((_left, top) => {
          if (selected.current !== input || !current.current.enabled || !Keyboard.isVisible())
            return;
          const delta = inputRevealDelta(
            top + input.bounds.top,
            input.bounds.height,
            current.current.start,
            bottom - space.x3,
          );
          if (Math.abs(delta) > 1) current.current.reveal(delta);
        });
      });
    });
  }, [composer]);
  useLayoutEffect(() => {
    if (!enabled) return;
    const listener = Keyboard.addListener('keyboardDidShow', measure);
    return () => {
      listener.remove();
      if (pending.current !== undefined) cancelAnimationFrame(pending.current);
      selected.current = undefined;
    };
  }, [enabled, measure]);
  useLayoutEffect(() => {
    selected.current = undefined;
  }, [enabled, scope]);
  return useCallback(
    (node: MeasuredView, bounds: GenuiInputBounds | undefined) => {
      if (!current.current.enabled) return;
      if (bounds === undefined) {
        if (selected.current?.node === node) selected.current = undefined;
      } else {
        selected.current = { node, bounds };
        measure();
      }
    },
    [measure],
  );
}

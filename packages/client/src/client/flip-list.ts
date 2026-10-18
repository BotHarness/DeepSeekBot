import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useFlipList<T extends HTMLElement>(): RefObject<T> {
  const container = useRef<T>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = container.current;
    if (root === null) return;
    const next = new Map<string, number>();
    const origin = root.getBoundingClientRect().top - root.scrollTop;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const element of root.querySelectorAll<HTMLElement>('[data-flip-key]')) {
      const key = element.dataset['flipKey']!;
      const top = element.getBoundingClientRect().top - origin;
      next.set(key, top);
      const previous = positions.current.get(key);
      if (
        reduced ||
        previous === undefined ||
        Math.abs(previous - top) < 1 ||
        typeof element.animate !== 'function'
      )
        continue;
      element.animate(
        [{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      );
    }
    positions.current = next;
  });
  return container;
}

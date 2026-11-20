import { useRef, type RefCallback } from 'react';

import { useMountedResource } from './mounted-resource.js';
import { smoothLevel } from './voice-level.js';

export function useVoiceRipple<T extends HTMLElement>(
  live: boolean,
  level: () => number,
): RefCallback<T> {
  const read = useRef(level);
  read.current = level;
  return useMountedResource<T>(
    (node) => {
      if (!live || typeof requestAnimationFrame !== 'function') return;
      let shown = 0;
      let frame = requestAnimationFrame(function tick() {
        shown = smoothLevel(shown, read.current());
        node.style.setProperty('--bh-voice-level', shown.toFixed(3));
        frame = requestAnimationFrame(tick);
      });
      return () => {
        cancelAnimationFrame(frame);
        node.style.removeProperty('--bh-voice-level');
      };
    },
    [live],
  );
}

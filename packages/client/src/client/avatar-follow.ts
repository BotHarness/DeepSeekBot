import type { RefCallback } from 'react';

import { useMountedResource } from './mounted-resource.js';

type Box = { offsetTop: number; offsetHeight: number };

export function followDistance(previous: Box, last: Box): number {
  return last.offsetTop + last.offsetHeight - (previous.offsetTop + previous.offsetHeight);
}

export function followAvatar(avatar: HTMLElement): Animation | undefined {
  if (avatar.ownerDocument.documentElement.dataset['botharnessMotion'] === 'reduce') return;
  if (typeof avatar.animate !== 'function') return;
  const wraps = avatar.parentElement?.querySelectorAll<HTMLElement>(
    ':scope > .bh-message-stack > .bh-bubble-wrap',
  );
  if (wraps === undefined || wraps.length < 2) return;
  const distance = followDistance(wraps[wraps.length - 2]!, wraps[wraps.length - 1]!);
  if (distance <= 0) return;
  return avatar.animate([{ transform: `translateY(${-distance}px)` }, { transform: 'none' }], {
    duration: 220,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  });
}

export function useAvatarFollow(lastId: string, arriving: boolean): RefCallback<HTMLSpanElement> {
  return useMountedResource<HTMLSpanElement>(
    (node) => {
      if (arriving) followAvatar(node);
    },
    [lastId],
  );
}

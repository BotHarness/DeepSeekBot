import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color } from './ds/tokens.stylex.js';

const RADIUS = 5.25;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const styles = stylex.create({
  track: { stroke: color.divider },
  fill: { stroke: color.muted },
  near: { stroke: color.warning },
  full: { stroke: color.danger },
});

export function contextRingLevel(
  used: number | null,
  capacity: number,
  threshold?: number,
): 'normal' | 'near' | 'full' {
  if (used === null || capacity <= 0) return 'normal';
  if (used >= capacity * 0.95) return 'full';
  if (threshold !== undefined && threshold > 0 && used >= threshold) return 'near';
  return 'normal';
}

export function ContextRing({
  used,
  capacity,
  threshold,
  size = 14,
}: {
  used: number | null;
  capacity: number;
  threshold?: number | undefined;
  size?: number;
}): ReactElement {
  const share = used === null || capacity <= 0 ? 0 : Math.min(1, Math.max(0, used / capacity));
  const level = contextRingLevel(used, capacity, threshold);
  return (
    <svg
      data-context-ring={level}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r={RADIUS} strokeWidth="1.75" {...stylex.props(styles.track)} />
      {share === 0 ? null : (
        <circle
          cx="7"
          cy="7"
          r={RADIUS}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={`${String(CIRCUMFERENCE * share)} ${String(CIRCUMFERENCE)}`}
          transform="rotate(-90 7 7)"
          {...stylex.props(
            level === 'full' ? styles.full : level === 'near' ? styles.near : styles.fill,
          )}
        />
      )}
    </svg>
  );
}

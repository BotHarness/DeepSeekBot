import * as stylex from '@stylexjs/stylex';
import type { ReactElement } from 'react';

import { Icon } from './icon.js';
import { border, color, radius } from './tokens.stylex.js';

const styles = stylex.create({
  tile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxSizing: 'border-box',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: color.logoTile,
    overflow: 'hidden',
  },
  fallback: { backgroundColor: color.base, color: color.muted },
  image: { display: 'block', objectFit: 'contain' },
});

export function BrandLogo({
  src,
  size = 36,
  fallbackIcon = 'plug',
}: {
  src: string | undefined;
  size?: number;
  fallbackIcon?: string;
}): ReactElement {
  const inner = Math.round(size * 0.62);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      {...stylex.props(styles.tile, src === undefined && styles.fallback)}
    >
      {src === undefined ? (
        <Icon name={fallbackIcon} size={Math.round(size / 2)} />
      ) : (
        <img alt="" src={src} width={inner} height={inner} {...stylex.props(styles.image)} />
      )}
    </span>
  );
}

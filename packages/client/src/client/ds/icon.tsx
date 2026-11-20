import type { ReactElement } from 'react';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { size as iconSize } from './tobs.stylex.js';

export function Icon({
  name,
  large = false,
  size,
  filled = false,
  className,
}: {
  readonly name: string;
  readonly large?: boolean;
  readonly size?: number;
  readonly filled?: boolean;
  readonly className?: string;
}): ReactElement {
  const box = size ?? (large ? iconSize.iconLarge : iconSize.icon);
  return (
    <ChannelSidebarIcon
      name={name}
      size={box}
      filled={filled}
      className={className}
      strokeWidth={(Number.parseFloat(iconSize.iconStroke) * 24) / Number.parseFloat(String(box))}
    />
  );
}

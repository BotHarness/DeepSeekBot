import type { ReactElement } from 'react';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { size } from './tobs.stylex.js';

export function Icon({
  name,
  large = false,
}: {
  readonly name: string;
  readonly large?: boolean;
}): ReactElement {
  const box = large ? size.iconLarge : size.icon;
  return (
    <ChannelSidebarIcon
      name={name}
      size={box}
      strokeWidth={(Number.parseFloat(size.iconStroke) * 24) / Number.parseFloat(box)}
    />
  );
}

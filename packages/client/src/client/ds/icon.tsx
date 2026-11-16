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
  return (
    <ChannelSidebarIcon
      name={name}
      size={large ? size.iconLarge : size.icon}
      strokeWidth={Number(size.iconStroke)}
    />
  );
}

import { Menu } from './appearance-primitives.js';
import { useState, type ReactElement } from 'react';
import { type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';

export function SidebarViewMenu({
  label,
  items,
  selectedIds,
  onSelect,
}: {
  label: string;
  items: readonly MenuEntry[];
  selectedIds: readonly string[];
  onSelect(id: string): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      anchor={
        <Tooltip label={label} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChannelSidebarIcon name="settings" size={14} />
          </IconButton>
        </Tooltip>
      }
      items={items}
      selectedIds={selectedIds}
      onSelect={(id) => {
        setOpen(false);
        onSelect(id);
      }}
      onClose={() => setOpen(false)}
    />
  );
}

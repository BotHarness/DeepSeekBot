import { Menu } from '../appearance-primitives.js';
import { useState, type ReactElement } from 'react';
import { type MenuEntry } from '../ds/menu.js';
import { InstantTooltipScope, Tooltip } from '../ds/tooltip.js';
import type { DockPanelRegistration } from '../dock-panels.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { IconButton } from '../ds/icon-button.js';
import { ChannelSidebarIcon } from './dock-context.js';

const RESET_ID = 'bh:dock-reset';

const groupRank = (panel: DockPanelRegistration): number =>
  panel.entry?.scope === 'channel' ? 1 : 0;

export function ChannelDockPanelsMenu({
  panels,
  openIds,
  t,
  onToggle,
  onReset,
}: {
  panels: readonly DockPanelRegistration[];
  openIds: readonly string[];
  t: BotHarnessTranslate;
  onToggle(id: string): void;
  onReset(): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const menuMount = useMountedResource<HTMLSpanElement>(
    (node) => {
      if (!open || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        if (node.getClientRects().length === 0) setOpen(false);
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [open],
  );
  const label = t('dock.panels');
  const items: MenuEntry[] = [
    { type: 'label', id: 'bh:dock-panels', text: label },
    ...[...panels]
      .sort((left, right) => groupRank(left) - groupRank(right))
      .map((panel) => ({
        id: panel.id,
        label: panel.title,
        icon: <ChannelSidebarIcon name={panel.icon} />,
      })),
    { type: 'separator', id: 'bh:dock-separator' },
    { id: RESET_ID, label: t('dock.reset') },
  ];
  return (
    <span ref={menuMount} className="bh-dock-menu" data-dock-menu="">
      <InstantTooltipScope>
        <Menu
          open={open}
          portal
          dense
          align="end"
          anchor={
            <Tooltip label={label} side="bottom" portal delayMs={500}>
              <IconButton
                tone="subtle"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                <ChannelSidebarIcon name="panels-top-left" />
              </IconButton>
            </Tooltip>
          }
          items={items}
          selectedIds={openIds}
          onSelect={(id) => {
            setOpen(false);
            if (id === RESET_ID) onReset();
            else onToggle(id);
          }}
          onClose={() => setOpen(false)}
        />
      </InstantTooltipScope>
    </span>
  );
}

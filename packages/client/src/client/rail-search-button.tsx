import { useSyncExternalStore, type ReactElement } from 'react';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import type { QuickSwitcherLauncher } from './quick-switcher-launcher.js';
import { bindingKeys, type ShortcutBindings } from './shortcut-bindings.js';

const noSubscription = (): (() => void) => () => {};

export function RailSearchButton({
  launcher,
  bindings,
  t,
}: {
  launcher: QuickSwitcherLauncher;
  bindings?: ShortcutBindings | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const binding = useSyncExternalStore(
    bindings?.subscribe ?? noSubscription,
    () => bindings?.getSnapshot()['quick-switcher'],
  );
  const label = t('quickSwitcher.title');
  return (
    <Tooltip
      label={label}
      shortcutKeys={binding === undefined ? undefined : bindingKeys(binding)}
      side="right"
    >
      <button type="button" aria-label={label} onClick={() => launcher.open('rail')}>
        <ChannelSidebarIcon name="search" />
      </button>
    </Tooltip>
  );
}

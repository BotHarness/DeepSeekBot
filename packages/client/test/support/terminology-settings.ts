import { createElement, useSyncExternalStore, type ReactElement } from 'react';
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChannelSidebarSettingsProps } from '../../src/client/channel-sidebar.js';
import { SettingsSubmenu } from '../../src/client/channel-sidebar-settings.js';
import { channelSidebarPrefs } from '../../src/client/channel-sidebar-prefs.js';

export function TerminologySettings({ t, onPreview }: ChannelSidebarSettingsProps): ReactElement {
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  return createElement(SettingsSubmenu, {
    label: t('entry.memoryEvolution') + ' · ' + t('memory.terminology'),
    onPreview,
    children: (['memory', 'git'] as const).map((term) =>
      createElement(MenuItemButton, {
        key: term,
        icon: terminology === term ? createElement('svg') : undefined,
        onSelect: () => channelSidebarPrefs.setMemoryTerminology(term),
        children: t(term === 'memory' ? 'memory.terms.memory' : 'memory.terms.git'),
      }),
    ),
  });
}

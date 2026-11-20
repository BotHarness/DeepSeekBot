import type { ReactElement } from 'react';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarRegistry,
  ChannelSidebarTab,
} from './channel-sidebar.js';
import { useChannelPanelClose } from './channel-dock.js';
import { useMessageHost } from './message-host.js';
import { RemoteHostViewerPanel } from './remote-host-viewer-panel.js';
import { useHostName } from './host-looks.js';

function HostViewer({
  kind,
  ...props
}: ChannelSidebarEntryProps & { kind: 'browser' | 'computer' }): ReactElement | null {
  const host = useMessageHost();
  const close = useChannelPanelClose(`botharness-${kind}`);
  const hostName = useHostName(host?.hostId, '');
  if (host === undefined || props.botSlug === undefined) return null;
  return (
    <RemoteHostViewerPanel
      client={host.client}
      kind={kind}
      slug={props.botSlug}
      hostName={hostName}
      t={props.t}
      onClose={close ?? (() => props.setExpanded?.(false))}
    />
  );
}
function Browser(props: ChannelSidebarEntryProps): ReactElement {
  return <HostViewer {...props} kind="browser" />;
}
function Computer(props: ChannelSidebarEntryProps): ReactElement {
  return <HostViewer {...props} kind="computer" />;
}

export function remoteChannelSidebar(registry: ChannelSidebarRegistry): ChannelSidebarRegistry {
  const entries = new WeakMap<readonly ChannelSidebarEntry[], readonly ChannelSidebarEntry[]>();
  const tabs = new WeakMap<readonly ChannelSidebarTab[], readonly ChannelSidebarTab[]>();
  return {
    register: registry.register,
    registerTab: registry.registerTab,
    subscribe: registry.subscribe,
    entries(scope) {
      const original = registry.entries(scope);
      let mapped = entries.get(original);
      if (mapped === undefined) {
        mapped = original.map((entry) => {
          const component =
            entry.id === 'botharness-browser'
              ? Browser
              : entry.id === 'botharness-computer'
                ? Computer
                : undefined;
          if (component === undefined) return entry;
          const { headerAction: _action, badge: _badge, headerTabs: _tabs, ...rest } = entry;
          return { ...rest, component };
        });
        entries.set(original, mapped);
      }
      return mapped;
    },
    tabs(scope) {
      const original = registry.tabs(scope);
      let mapped = tabs.get(original);
      if (mapped === undefined) {
        mapped = original.map((tab) => {
          if (tab.id !== 'screen') return tab;
          const { badge: _badge, ...rest } = tab;
          return rest;
        });
        tabs.set(original, mapped);
      }
      return mapped;
    },
  };
}

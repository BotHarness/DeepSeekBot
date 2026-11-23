import { useSyncExternalStore, type ReactNode } from 'react';
import type { HostClient, RosterView } from '@botharness/host-client/client';
import { vi, type Mock } from 'vitest';
import type { CloudClient, CloudRow } from '../src/cloud/client';
import type {
  createCloudConversations,
  CloudConversation,
  ConversationWorkspace,
} from '../src/cloud/conversations';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';
import { type HostColorId } from '@botharness/host-client/ui/design/host-look';

export const whoami: Mock<(_id: string) => Promise<void>> = vi.fn(async (_id: string) => {});

export const push: Mock = vi.fn();
export const call: Mock<(...args: unknown[]) => Promise<object>> = vi.fn(
  async (..._args: unknown[]) => ({}),
);
export const refresh: Mock<() => Promise<undefined>> = vi.fn(async () => undefined);

export const { cloudState, directoryState, hostState, menus, rowProps } = {
  menus: [] as Array<{ text: string; onPress?: () => unknown }[]>,
  rowProps: new Map<string, Record<string, unknown>>(),
  hostState: {
    connecting: false,
    removed: false,
    color: undefined as HostColorId | undefined,
    fontScale: 1,
    actions: false,
    unread: false,
    hostId: 'h1',
    live: undefined as HostClient | undefined,
    activityItems: [] as HumanAttentionItem[],
  },
  cloudState: {
    live: undefined as CloudClient | undefined,
    error: undefined as string | undefined,
    ready: true,
    busy: false,
    rows: [] as CloudRow[],
  },
  directoryState: {
    live: undefined as ReturnType<typeof createCloudConversations> | undefined,
    busy: false,
    ready: true,
    rows: [] as CloudConversation[],
    workspaces: [] as ConversationWorkspace[],
    errors: [] as string[],
  },
};

export const roster: RosterView = {
  bots: [
    {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-ada',
      preview: 'Done',
    },
    {
      slug: 'xiaoming',
      displayName: '小明',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
    },
  ],
  channels: [{ id: 'launch-team', name: 'Launch team', memberCount: 3, members: [] }],
};

const activityClient = {
  getSnapshot: () => ({ connection: { status: 'connected' }, roster }),
  subscribe: () => () => {},
  onLive: () => () => {},
  refresh,
  call: async (method: string, args?: { category?: string }) => {
    if (method === 'humanAttention')
      return { queryVersion: 1, items: args?.category === 'action' ? hostState.activityItems : [] };
    if (method === 'channelUnreadCounts') return { channels: [] };
    return call(method, args);
  },
};

export async function mockConversationPeek(importOriginal: <T>() => Promise<T>) {
  const actual = await importOriginal<typeof import('../src/ui/shell/conversation-peek')>();
  const { Platform } = await import('react-native');
  return {
    ...actual,
    get conversationPeek() {
      return Platform.OS === 'ios';
    },
  };
}

export async function mockConversationFilter() {
  const { useSyncExternalStore } = await import('react');
  const { createConversationFilter } = await import('../src/host/conversation-filter');
  const conversationFilter = createConversationFilter({
    read: async () => undefined,
    write: () => {},
  });
  return {
    conversationFilter,
    useConversationFilter: () => [
      useSyncExternalStore(conversationFilter.subscribe, conversationFilter.getSnapshot),
      conversationFilter.set,
    ],
  };
}

export function mockCloudNative() {
  return {
    useCloudSnapshot: () =>
      cloudState.live
        ? useSyncExternalStore(cloudState.live.subscribe, cloudState.live.getSnapshot)
        : cloudState,
    cloudClient: {
      getSnapshot: () => cloudState.live?.getSnapshot() ?? cloudState,
      whoami: (id: string) => (cloudState.live ? cloudState.live.whoami(id) : whoami(id)),
      useOrganization: (id: string, organizationId: string) =>
        cloudState.live!.useOrganization(id, organizationId),
    },
  };
}

export function mockCloudConversations() {
  return {
    useCloudConversations: () =>
      directoryState.live
        ? useSyncExternalStore(directoryState.live.subscribe, directoryState.live.getSnapshot)
        : directoryState,
    cloudConversations: {
      refresh: async () => {
        await directoryState.live?.refresh();
      },
    },
  };
}

export async function mockReactNative() {
  const addEventListener: Mock<() => { remove: Mock }> = vi.fn(() => ({ remove: vi.fn() }));
  const native = await import('./react-native-shim');
  return {
    ...native,
    BackHandler: { addEventListener },
    Pressable: (props: Parameters<typeof native.Pressable>[0]) => {
      const id = props.testID;
      if (typeof id === 'string' && id.startsWith('conversation-row-')) rowProps.set(id, props);
      return native.Pressable(props);
    },
    useWindowDimensions: () => ({
      ...native.useWindowDimensions(),
      fontScale: hostState.fontScale,
    }),
    Dimensions: {
      get: () => ({
        ...native.useWindowDimensions(),
        fontScale: hostState.fontScale,
      }),
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
  };
}

export function mockHostSession() {
  return {
    useHostSessions: () =>
      hostState.removed
        ? []
        : [
            {
              saved: { hostId: hostState.hostId, hostName: 'studio' },
              client: hostState.live ?? activityClient,
              inbox: { refresh: async () => {} },
              snapshot: hostState.live
                ? useSyncExternalStore(hostState.live.subscribe, hostState.live.getSnapshot)
                : {
                    connection: {
                      status: hostState.connecting ? 'connecting' : 'connected',
                      route: '',
                    },
                    roster: hostState.connecting ? undefined : roster,
                  },
              attention: hostState.unread
                ? { status: 'ready', sections: { action: [] }, unread: { 'dm-ada': 2 } }
                : { status: 'loading' },
            },
          ],
    quietChannels: { get: () => [] },
    useHostSession: () => ({
      saved: hostState.removed ? null : { hostId: hostState.hostId, hostName: 'studio' },
      client: hostState.live ?? (hostState.actions ? { call, refresh } : undefined),
      inbox: undefined,
    }),
    useHostSnapshot: () =>
      hostState.live
        ? useSyncExternalStore(hostState.live.subscribe, hostState.live.getSnapshot)
        : {
            connection: { status: hostState.connecting ? 'connecting' : 'connected', route: '' },
            roster: hostState.connecting ? undefined : roster,
          },
    useInbox: () =>
      hostState.activityItems.length
        ? {
            status: 'ready',
            sections: { action: hostState.activityItems, replies: [], unread: [], handled: [] },
          }
        : hostState.unread
          ? { status: 'ready', sections: { action: [] }, unread: { 'dm-ada': 2 } }
          : { status: 'loading' },
    useQuietChannels: () => [],
    refreshQuietChannels: () => {},
  };
}

export async function mockSectionCollapse() {
  const { useSyncExternalStore } = await import('react');
  const { createSectionCollapse } = await import('../src/host/section-collapse');
  const sectionCollapse = createSectionCollapse({ read: async () => undefined, write: () => {} });
  return {
    sectionCollapse,
    useCollapsedSections: (hostId: string) =>
      useSyncExternalStore(sectionCollapse.subscribe, () => sectionCollapse.collapsed(hostId)),
  };
}

export async function mockHostDrawer() {
  const { createHostDrawer } = await import('../src/ui/shell/host-drawer-model');
  return {
    HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
    hostDrawer: createHostDrawer({
      switchTo: async () => true,
      showView: () => {},
      pair: () => {},
      notifications: () => {},
    }),
    focusOn: () => {},
    openHostDrawer: () => {},
    useHostDrawerOpen: () => false,
  };
}

import { useSyncExternalStore } from 'react';

import { createHostLooks, type HostLooks } from '../../../../apps/mobile/src/host/host-look.js';
import {
  DEFAULT_HOST_LOOK,
  shownHostName,
  HOST_COLOR_IDS,
  HOST_SYMBOL_IDS,
  hostColorInk,
  type HostColorId,
  type HostLook,
  type HostSymbolId,
} from '../../../../apps/mobile/src/ui/design/host-look.js';
import type { ColorRole } from '../../../../apps/mobile/src/ui/design/resolve-theme.js';
import { useBotColorScheme } from './bot-color-scheme.js';

export const HOST_LOOKS_STORAGE_KEY = 'botharness.hostLooks.v1';

export const HOST_SYMBOL_GLYPHS: Record<HostSymbolId, string> = {
  desktop: 'monitor',
  laptop: 'laptop',
  display: 'tv',
  server: 'server',
  terminal: 'terminal',
  cpu: 'cpu',
  home: 'house',
  office: 'building',
  work: 'briefcase',
  lab: 'flask-conical',
  game: 'gamepad-2',
  art: 'paintbrush',
  book: 'book-open',
  globe: 'globe',
  bolt: 'zap',
  star: 'star',
  heart: 'heart',
  leaf: 'leaf',
};

const SYMBOL_ORDER: readonly HostSymbolId[] = [
  'laptop',
  'server',
  'display',
  'home',
  'office',
  'work',
  'lab',
  'terminal',
  ...HOST_SYMBOL_IDS.filter(
    (id) =>
      ![
        'desktop',
        'laptop',
        'server',
        'display',
        'home',
        'office',
        'work',
        'lab',
        'terminal',
      ].includes(id),
  ),
  'desktop',
];

const COLOR_ORDER: readonly HostColorId[] = [
  'blue',
  'orange',
  'green',
  'purple',
  'teal',
  'pink',
  'indigo',
  'red',
  'yellow',
  'graphite',
].filter((id): id is HostColorId => (HOST_COLOR_IDS as string[]).includes(id));

export function unusedHostLook(used: readonly HostLook[]): HostLook {
  const symbols = new Set(
    used.flatMap((look) => (look.icon.kind === 'symbol' ? [look.icon.id] : [])),
  );
  const colors = new Set(used.flatMap((look) => (look.color === undefined ? [] : [look.color])));
  const symbol =
    SYMBOL_ORDER.find((id) => !symbols.has(id)) ?? SYMBOL_ORDER[used.length % SYMBOL_ORDER.length]!;
  const color =
    COLOR_ORDER.find((id) => !colors.has(id)) ?? COLOR_ORDER[used.length % COLOR_ORDER.length]!;
  return { icon: { kind: 'symbol', id: symbol }, color };
}

export function browserHostLooks(
  storage: Storage | undefined,
  lock: (work: () => Promise<void>) => Promise<void> = async (work) => {
    if (globalThis.navigator?.locks === undefined) throw new Error('host-look-lock-unavailable');
    let acquired = false;
    try {
      await navigator.locks.request(HOST_LOOKS_STORAGE_KEY, { mode: 'exclusive' }, async () => {
        acquired = true;
        await work();
      });
    } catch (error) {
      if (!acquired) throw new Error('host-look-lock-unavailable');
      throw error;
    }
  },
): HostLooks {
  return createHostLooks({
    read: async () => {
      if (storage === undefined) throw new Error('storage-unavailable');
      const value: unknown = JSON.parse(storage.getItem(HOST_LOOKS_STORAGE_KEY) ?? '{}');
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('storage-invalid');
      return value;
    },
    write: (value, check) => {
      if (storage === undefined) throw new Error('storage-unavailable');
      const encoded = JSON.stringify(value);
      check?.();
      storage.setItem(HOST_LOOKS_STORAGE_KEY, encoded);
    },
    transaction: lock,
    listen: (changed) => {
      if (typeof window === 'undefined') return () => {};
      const listener = (event: StorageEvent) => {
        if (event.storageArea === storage && (event.key === HOST_LOOKS_STORAGE_KEY || event.key === null)) changed();
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  });
}

let shared: HostLooks | undefined;

export function hostLooks(): HostLooks {
  shared ??= browserHostLooks(
    (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
  );
  return shared;
}

export function useHostLook(hostId: string | undefined): HostLook {
  const looks = hostLooks();
  const read = (): HostLook => (hostId === undefined ? DEFAULT_HOST_LOOK : looks.look(hostId));
  return useSyncExternalStore(looks.subscribe, read, read);
}

const INK_ROLES = {
  light: { fg: '#1d1d1f', base: '#ffffff', accent: '#007aff' },
  dark: { fg: '#f5f5f7', base: '#1c1c1e', accent: '#0a84ff' },
} as const;

export function useHostInk(color: HostColorId | undefined): string | undefined {
  const scheme = useBotColorScheme();
  if (color === undefined) return undefined;
  return hostColorInk(scheme, INK_ROLES[scheme] as unknown as Record<ColorRole, string>, color);
}

export function useHostName(hostId: string | undefined, name: string): string {
  return shownHostName(useHostLook(hostId), name);
}

export function useHostLookError(): string | undefined {
  const looks = hostLooks();
  return useSyncExternalStore(looks.subscribe, looks.error, looks.error);
}

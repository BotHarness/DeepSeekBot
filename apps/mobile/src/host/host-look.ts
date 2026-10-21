import {
  DEFAULT_HOST_LOOK,
  HOST_COLORS,
  HOST_EMOJI,
  HOST_SYMBOLS,
  hostLook,
  hostLookName,
  nearestHostColor,
  type HostColorId,
  type HostIcon,
  type HostLook,
} from '../ui/design/host-look';

export interface LookStorage {
  read(): Promise<unknown>;
  write(value: Record<string, HostLook>): void;
  forgetLegacyImages?(): void;
}

export interface HostLooks {
  look(hostId: string): HostLook;
  set(hostId: string, look: HostLook): void;
  subscribe(listener: () => void): () => void;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export function parseHostIcon(input: unknown): HostIcon {
  const value = record(input);
  const id = text(value['id']);
  const emoji = text(value['emoji']);
  if (value['kind'] === 'symbol' && id !== undefined && Object.hasOwn(HOST_SYMBOLS, id))
    return { kind: 'symbol', id: id as keyof typeof HOST_SYMBOLS };
  if (
    value['kind'] === 'emoji' &&
    emoji !== undefined &&
    (HOST_EMOJI as readonly string[]).includes(emoji)
  )
    return { kind: 'emoji', emoji };
  return DEFAULT_HOST_LOOK.icon;
}

export function parseHostColor(input: unknown): HostColorId | undefined {
  const id = text(input);
  return id !== undefined && Object.hasOwn(HOST_COLORS, id) ? (id as HostColorId) : undefined;
}

function legacyColor(input: unknown): HostColorId | undefined {
  const banner = record(input);
  const hex = text(banner['kind'] === 'gradient' ? banner['from'] : banner['color']);
  return hex === undefined ? undefined : nearestHostColor(hex.trim().toLowerCase());
}

export function isLegacyHostLook(input: unknown): boolean {
  const value = record(input);
  return 'avatar' in value || 'banner' in value;
}

export function parseHostLook(input: unknown): HostLook {
  const value = record(input);
  const color = 'color' in value ? parseHostColor(value['color']) : legacyColor(value['banner']);
  return hostLook(hostLookName(value['name']), parseHostIcon(value['icon']), color);
}

export function createHostLooks(storage: LookStorage): HostLooks {
  const byHost = new Map<string, HostLook>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  let touched = false;
  void storage.read().then(
    (value) => {
      if (touched) return;
      const stored = Object.entries(record(value));
      for (const [hostId, look] of stored) byHost.set(hostId, parseHostLook(look));
      if (stored.some(([, look]) => isLegacyHostLook(look))) {
        storage.write(Object.fromEntries(byHost));
        storage.forgetLegacyImages?.();
      }
      notify();
    },
    () => undefined,
  );
  return {
    look: (hostId) => byHost.get(hostId) ?? DEFAULT_HOST_LOOK,
    set(hostId, look) {
      touched = true;
      byHost.set(hostId, parseHostLook(look));
      storage.write(Object.fromEntries(byHost));
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

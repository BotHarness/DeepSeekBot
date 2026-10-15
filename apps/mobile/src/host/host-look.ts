import {
  bannerHex,
  DEFAULT_HOST_LOOK,
  HOST_AVATAR_PRESETS,
  type HostAvatar,
  type HostBanner,
  type HostLook,
} from '../ui/design/host-look';

export interface LookStorage {
  read(): Promise<unknown>;
  write(value: Record<string, HostLook>): void;
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

export function parseHostAvatar(input: unknown): HostAvatar {
  const value = record(input);
  const id = text(value['id']);
  const uri = text(value['uri']);
  if (
    value['kind'] === 'preset' &&
    id !== undefined &&
    (HOST_AVATAR_PRESETS as readonly string[]).includes(id)
  )
    return { kind: 'preset', id };
  if (value['kind'] === 'image' && uri !== undefined) return { kind: 'image', uri };
  return DEFAULT_HOST_LOOK.avatar;
}

export function parseHostBanner(input: unknown): HostBanner {
  const value = record(input);
  const hex = (key: string) => {
    const raw = text(value[key]);
    return raw === undefined ? undefined : bannerHex(raw);
  };
  const color = hex('color');
  const from = hex('from');
  const to = hex('to');
  const uri = text(value['uri']);
  if (value['kind'] === 'color' && color !== undefined) return { kind: 'color', color };
  if (value['kind'] === 'gradient' && from !== undefined && to !== undefined)
    return { kind: 'gradient', from, to };
  if (value['kind'] === 'image' && uri !== undefined) return { kind: 'image', uri };
  return DEFAULT_HOST_LOOK.banner;
}

export function parseHostLook(input: unknown): HostLook {
  const value = record(input);
  return {
    avatar: parseHostAvatar(value['avatar']),
    banner: parseHostBanner(value['banner']),
  };
}

/** How each paired Host looks in the Chats header, kept on the phone and keyed by Host. */
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
      for (const [hostId, look] of Object.entries(record(value)))
        byHost.set(hostId, parseHostLook(look));
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

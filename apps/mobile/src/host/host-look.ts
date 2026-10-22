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
  write(value: Record<string, HostLook>, check?: () => void): void;
  forgetLegacyImages?(): void;
  transaction?(work: () => Promise<void>): Promise<void>;
  listen?(changed: () => void): () => void;
}

export interface HostLooks {
  readonly ready: Promise<void>;
  error(): string | undefined;
  refresh(check?: () => void): Promise<void>;
  read(hostId: string, check?: () => void): Promise<HostLook>;
  update(hostId: string, change: (current: HostLook) => HostLook, check?: () => void): Promise<HostLook>;
  look(hostId: string): HostLook;
  set(hostId: string, look: HostLook): void;
  subscribe(listener: () => void): () => void;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export function isHostIcon(input: unknown): input is HostIcon {
  const value = record(input);
  return (value['kind'] === 'symbol' && typeof value['id'] === 'string' && Object.hasOwn(HOST_SYMBOLS, value['id'])) ||
    (value['kind'] === 'emoji' && typeof value['emoji'] === 'string' && (HOST_EMOJI as readonly string[]).includes(value['emoji']));
}

export function isHostColor(input: unknown): input is HostColorId {
  return typeof input === 'string' && Object.hasOwn(HOST_COLORS, input);
}

export function parseHostIcon(input: unknown): HostIcon {
  if (!isHostIcon(input)) return DEFAULT_HOST_LOOK.icon;
  return input.kind === 'symbol' ? { kind: 'symbol', id: input.id } : { kind: 'emoji', emoji: input.emoji };
}

export function parseHostColor(input: unknown): HostColorId | undefined {
  return isHostColor(input) ? input : undefined;
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
  let failure: string | undefined;
  let unlisten: (() => void) | undefined;
  let touched = false;
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const fail = (code: string): never => {
    failure = code;
    notify();
    throw new Error(code);
  };
  const publish = (value: Record<string, HostLook>) => {
    for (const id of byHost.keys()) if (!(id in value)) byHost.delete(id);
    for (const [id, look] of Object.entries(value))
      if (JSON.stringify(byHost.get(id)) !== JSON.stringify(look)) byHost.set(id, look);
    failure = undefined;
    notify();
  };
  const load = async (): Promise<Record<string, HostLook>> => {
    let raw: unknown;
    try {
      raw = await storage.read();
    } catch {
      return fail('host-look-storage-read-failed');
    }
    return Object.fromEntries(Object.entries(record(raw)).map(([id, look]) => [id, parseHostLook(look)]));
  };
  const transaction = async (work: () => Promise<void>) => {
    if (storage.transaction === undefined) return work();
    try {
      await storage.transaction(work);
    } catch (error) {
      if (error instanceof Error && error.message === 'host-look-lock-unavailable')
        return fail(error.message);
      throw error;
    }
  };
  const persist = (value: Record<string, HostLook>, check?: () => void) => {
    check?.();
    try {
      if (check === undefined) storage.write(value);
      else storage.write(value, check);
    } catch {
      check?.();
      return fail('host-look-storage-failed');
    }
  };
  const refresh = async (check?: () => void) => transaction(async () => {
    check?.();
    const value = await load();
    check?.();
    publish(value);
  });
  const ready = (storage.transaction === undefined
    ? storage.read().then((raw) => {
        if (touched) return;
        const stored = Object.entries(record(raw));
        const value = Object.fromEntries(stored.map(([id, look]) => [id, parseHostLook(look)]));
        if (stored.some(([, look]) => isLegacyHostLook(look))) {
          persist(value);
          storage.forgetLegacyImages?.();
        }
        publish(value);
      }, () => fail('host-look-storage-read-failed'))
    : refresh()).catch(() => undefined);
  const available = async () => {
    await ready;
    if (failure !== undefined) throw new Error(failure);
  };
  const current = (hostId: string) => byHost.get(hostId) ?? DEFAULT_HOST_LOOK;
  return {
    ready,
    error: () => failure,
    refresh,
    look: current,
    async read(hostId, check) {
      await available();
      let result = current(hostId);
      await transaction(async () => {
        if (failure !== undefined) throw new Error(failure);
        check?.();
        const value = await load();
        check?.();
        publish(value);
        result = current(hostId);
      });
      return result;
    },
    async update(hostId, change, check) {
      await available();
      let result = current(hostId);
      await transaction(async () => {
        if (failure !== undefined) throw new Error(failure);
        check?.();
        const value = await load();
        check?.();
        result = parseHostLook(change(value[hostId] ?? DEFAULT_HOST_LOOK));
        check?.();
        persist({ ...value, [hostId]: result }, check);
        publish({ ...value, [hostId]: result });
      });
      return result;
    },
    set(hostId, look) {
      if (storage.transaction !== undefined) throw new Error('host-look-transaction-required');
      if (failure !== undefined) return;
      const next = parseHostLook(look);
      persist({ ...Object.fromEntries(byHost), [hostId]: next });
      touched = true;
      byHost.set(hostId, next);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1)
        unlisten = storage.listen?.(() => {
          if (failure === undefined) void refresh().catch(() => undefined);
        });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unlisten?.();
          unlisten = undefined;
        }
      };
    },
  };
}

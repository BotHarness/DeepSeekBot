import type { BridgeCall } from './bridge.js';
import type { ConfigStorage } from './roster-config.js';

export class HostAcknowledgements {
  private items: Record<string, string> = {};
  private loaded = false;
  private loading: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(
    private readonly call: BridgeCall,
    private readonly storage: ConfigStorage | undefined,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  get settled(): boolean {
    return this.loaded;
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.loading ??= this.call('acknowledgements', {})
      .then((result) => {
        const items = result.ok ? (result.value as { items?: unknown } | null)?.items : undefined;
        return typeof items === 'object' && items !== null
          ? Object.fromEntries(
              Object.entries(items).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            )
          : {};
      })
      .catch(() => ({}))
      .then((items) => {
        this.items = { ...items, ...this.items };
        this.loaded = true;
        this.loading = undefined;
        this.publish();
      });
    return this.loading;
  }

  remote(key: string): string | undefined {
    return this.items[key];
  }

  value(key: string, localKey?: string): string | undefined {
    const local = localKey === undefined ? null : this.read(localKey);
    const remote = this.items[key];
    if (remote !== undefined) {
      if (localKey !== undefined && local === null) this.write(localKey, remote);
      return remote;
    }
    if (local !== null && this.loaded) this.record(key, local);
    return local ?? undefined;
  }

  record(key: string, value: string, localKey?: string): void {
    if (localKey !== undefined) this.write(localKey, value);
    if (this.items[key] === value) return;
    this.items = { ...this.items, [key]: value };
    this.publish();
    void this.call('acknowledge', key === 'release-notes-seen' ? { key, value } : { key }).catch(
      () => undefined,
    );
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {}
  }

  private publish(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

let current: HostAcknowledgements | undefined;

export function installHostAcknowledgements(value: HostAcknowledgements): () => void {
  current = value;
  return () => {
    if (current === value) current = undefined;
  };
}

export function hostAcknowledgements(): HostAcknowledgements | undefined {
  return current;
}

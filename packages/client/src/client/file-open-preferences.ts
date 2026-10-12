import type { HostFileApplication, HostFileOptions, HostFileTarget } from './host-file-actions.js';
import type { ConfigStorage } from './roster-config.js';

export type FileOpenScope = { kind: 'directory' } | { kind: 'file'; type: string };
export interface FileOpenPreference {
  application: string;
  name: string;
}
export type FileOpenDefault =
  | { source: 'preference' | 'system'; application: HostFileApplication }
  | { source: 'invalid'; preference: FileOpenPreference }
  | { source: 'none' };

export interface FileOpenPreferences {
  ready(): Promise<void>;
  get(scope: FileOpenScope): FileOpenPreference | undefined;
  set(scope: FileOpenScope, preference: FileOpenPreference): void;
  clear(scope: FileOpenScope): void;
  subscribe(listener: () => void): () => void;
}

type StoredDefaults = Record<string, FileOpenPreference>;

const STORAGE_PREFIX = 'botharness/file-open-defaults/v1/';

export function fileOpenScope(target: Pick<HostFileTarget, 'kind' | 'path'>): FileOpenScope {
  if (target.kind === 'directory') return { kind: 'directory' };
  const name = target.path.split(/[\\/]/).at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  return {
    kind: 'file',
    type: dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '',
  };
}

function scopeKey(scope: FileOpenScope): string {
  return scope.kind === 'directory' ? 'directory' : `file:${scope.type}`;
}

export function resolveFileOpenDefault(
  options: Pick<HostFileOptions, 'applications'>,
  preference: FileOpenPreference | undefined,
): FileOpenDefault {
  if (preference !== undefined) {
    const application = options.applications.find((app) => app.id === preference.application);
    return application === undefined
      ? { source: 'invalid', preference }
      : { source: 'preference', application };
  }
  const application = options.applications.find((app) => app.default);
  return application === undefined ? { source: 'none' } : { source: 'system', application };
}

function decode(raw: string | null, profileId: string): StoredDefaults {
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null) return {};
  const record = value as { profileId?: unknown; defaults?: unknown };
  if (record.profileId !== profileId || typeof record.defaults !== 'object') return {};
  const defaults: StoredDefaults = {};
  for (const [key, entry] of Object.entries(record.defaults ?? {})) {
    const item = entry as { application?: unknown; name?: unknown } | null;
    if (typeof item?.application === 'string' && typeof item.name === 'string')
      defaults[key] = { application: item.application, name: item.name };
  }
  return defaults;
}

export function createFileOpenPreferences(deps: {
  storage: ConfigStorage | undefined;
  context?: () => Promise<{ profileId: string }>;
  onExternalChange?: (listener: (key: string | null) => void) => () => void;
}): FileOpenPreferences {
  const listeners = new Set<() => void>();
  let profileId: string | undefined;
  let loading: Promise<void> | undefined;
  const key = (): string => {
    if (profileId === undefined)
      throw new Error('Default applications are unavailable until the Host profile is identified');
    return STORAGE_PREFIX + profileId;
  };
  const read = (): StoredDefaults => {
    if (profileId === undefined || deps.storage === undefined) return {};
    try {
      return decode(deps.storage.getItem(key()), profileId);
    } catch {
      return {};
    }
  };
  const write = (defaults: StoredDefaults): void => {
    const storageKey = key();
    if (deps.storage === undefined) throw new Error('Browser storage is unavailable');
    const body = JSON.stringify({ version: 1, profileId, defaults });
    deps.storage.setItem(storageKey, body);
    if (deps.storage.getItem(storageKey) !== body)
      throw new Error('Browser storage did not keep the default application');
    for (const listener of listeners) listener();
  };
  const watch =
    deps.onExternalChange ??
    ((listener) => {
      if (typeof window === 'undefined') return () => {};
      const handle = (event: StorageEvent): void => listener(event.key);
      window.addEventListener('storage', handle);
      return () => window.removeEventListener('storage', handle);
    });
  let unwatch: (() => void) | undefined;
  return {
    ready() {
      if (profileId !== undefined) return Promise.resolve();
      loading ??= (async () => {
        if (deps.context === undefined) throw new Error('Host profile identity is unavailable');
        const context = await deps.context();
        if (!context.profileId) throw new Error('Host profile identity is unavailable');
        profileId = context.profileId;
        for (const listener of listeners) listener();
      })().catch((failure: unknown) => {
        loading = undefined;
        throw failure;
      });
      return loading;
    },
    get: (scope) => read()[scopeKey(scope)],
    set(scope, preference) {
      write({ ...read(), [scopeKey(scope)]: preference });
    },
    clear(scope) {
      const { [scopeKey(scope)]: _removed, ...rest } = read();
      write(rest);
    },
    subscribe(listener) {
      listeners.add(listener);
      unwatch ??= watch((changed) => {
        if (profileId === undefined || (changed !== null && changed !== key())) return;
        for (const current of listeners) current();
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unwatch?.();
          unwatch = undefined;
        }
      };
    },
  };
}

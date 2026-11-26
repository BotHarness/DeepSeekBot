import { describeHostSettings } from './host-settings';
import { record, type HostCall } from './host-answer';

export type HostSettingsScopeSnapshot =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; value: Record<string, unknown>; revision: unknown };

export interface HostSettingsScope {
  getSnapshot(): HostSettingsScopeSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  write(
    endpoint: 'settings/update' | 'settings/mutate',
    payload: Record<string, unknown>,
  ): Promise<boolean>;
}

export function hostSettingsScope(host: HostCall, ns: string): HostSettingsScope {
  let snapshot: HostSettingsScopeSnapshot = { status: 'loading' };
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: HostSettingsScopeSnapshot): void => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const adopt = (found: { revision?: unknown; value?: unknown }): void => {
    publish({ status: 'ready', value: record(found['value']) ?? {}, revision: found['revision'] });
  };
  const refresh = async (): Promise<void> => {
    const at = ++generation;
    const found = await describeHostSettings(host).then(
      (namespaces) => namespaces.find((entry) => entry.ns === ns),
      () => undefined,
    );
    if (at !== generation) return;
    if (found === undefined) publish({ status: 'unavailable' });
    else adopt(found);
  };
  const write = async (
    endpoint: 'settings/update' | 'settings/mutate',
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    const at = ++generation;
    const expectedRevision = snapshot.status === 'ready' ? snapshot.revision : undefined;
    const saved = await host
      .call(endpoint, { ns, expectedRevision, ...payload })
      .then(record, () => undefined);
    if (saved === undefined || record(saved['value']) === undefined) {
      await refresh();
      return false;
    }
    if (at === generation) adopt(saved);
    return true;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    write,
  };
}

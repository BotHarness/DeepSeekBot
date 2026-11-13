import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { hostSettingsDrafts } from './host-settings-drafts.js';

export interface RemoteBotSettingsTarget {
  hostId: string;
  hostName: string;
  slug: string;
  name: string;
  client: HostClient;
}

export function remoteBotSettingsClient(
  target: RemoteBotSettingsTarget,
  currentClient: (hostId: string) => HostClient | undefined,
): HostClient {
  return {
    ...target.client,
    async call<T>(method: string, args?: Record<string, unknown>): Promise<T> {
      const check = () => {
        if (
          currentClient(target.hostId) !== target.client ||
          target.client.getSnapshot().connection.status !== 'connected'
        )
          throw new Error('remote-bot-settings-unavailable');
      };
      check();
      const answer = await target.client.call<T>(method, args);
      check();
      return answer;
    },
  };
}

export function createRemoteBotSettingsTarget(
  prepare: (hostId: string) => Promise<boolean> = hostSettingsDrafts.prepare,
) {
  let target: (RemoteBotSettingsTarget & { session: number }) | undefined;
  let session = 0;
  let pending = false;
  const listeners = new Set<() => void>();
  const change = async (next: RemoteBotSettingsTarget | undefined) => {
    if (pending || target === next) return false;
    pending = true;
    try {
      if (target !== undefined && !(await prepare(target.hostId))) return false;
      target = next === undefined ? undefined : { ...next, session: ++session };
      for (const listener of listeners) listener();
      return true;
    } finally {
      pending = false;
    }
  };
  return {
    getSnapshot: () => target,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: (next: RemoteBotSettingsTarget) => change(next),
    close: () => change(undefined),
  };
}

export const remoteBotSettingsTarget = createRemoteBotSettingsTarget();

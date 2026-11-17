import {
  BOT_MODE_NAMESPACE,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SORT,
  type BotModeSettings,
} from '@botharness/host-client/shared/bot-mode-settings';

import type { BotModePathOp, BotModeScope, BotModeScopeSnapshot } from './bot-mode-prefs.js';
import type { BridgeCall } from './bridge.js';

export interface RemoteBotModeScope extends BotModeScope {
  refresh(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function settingsOf(value: unknown): BotModeSettings {
  return {
    developerMode: DEFAULT_BOT_MODE_DEVELOPER,
    motionPreference: DEFAULT_BOT_MODE_MOTION,
    botIcon: DEFAULT_BOT_MODE_ICON,
    sortMode: DEFAULT_BOT_MODE_SORT,
    sortModes: {},
    ...record(value),
  };
}

export function remoteBotModeScope(call: BridgeCall): RemoteBotModeScope {
  let snapshot: BotModeScopeSnapshot = {
    status: 'loading',
    value: undefined,
    user: undefined,
    writable: false,
    mode: 'host',
  };
  let revision: unknown;
  const listeners = new Set<() => void>();
  const publish = (next: BotModeScopeSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const adopt = (found: Record<string, unknown>): void => {
    revision = found['revision'];
    publish({
      status: 'ready',
      value: settingsOf(found['value']),
      user: undefined,
      writable: true,
      mode: 'host',
    });
  };
  const refresh = async (): Promise<void> => {
    const result = await call('settings/describe', {});
    if (!result.ok) {
      publish({ ...snapshot, status: 'unavailable', writable: false });
      return;
    }
    const namespaces = record(result.value)['namespaces'];
    const found = Array.isArray(namespaces)
      ? namespaces.map(record).find((entry) => entry['ns'] === BOT_MODE_NAMESPACE)
      : undefined;
    if (found === undefined) {
      publish({ ...snapshot, status: 'unavailable', writable: false });
      return;
    }
    adopt(found);
  };
  const write = async (endpoint: string, payload: Record<string, unknown>): Promise<boolean> => {
    const result = await call(endpoint, {
      ns: BOT_MODE_NAMESPACE,
      expectedRevision: revision,
      ...payload,
    });
    if (!result.ok) {
      await refresh();
      return false;
    }
    adopt(record(result.value));
    return true;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    set: (field, value) => write('settings/update', { patch: { [field]: value } }),
    mutate: (ops: readonly BotModePathOp[], expectedRevision?: number) =>
      write('settings/mutate', {
        ops,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      }),
  };
}

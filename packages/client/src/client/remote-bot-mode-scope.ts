import {
  BOT_MODE_NAMESPACE,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_MOTION,
  BOT_MODE_SORT_MODES,
  DEFAULT_BOT_MODE_SORT,
  type BotModeSettings,
  type BotModeSortMode,
} from '@botharness/host-client/shared/bot-mode-settings';

import type { BotModePathOp, BotModeScope, BotModeScopeSnapshot } from './bot-mode-prefs.js';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { hostSettingsScope } from '@botharness/host-client/host-settings-scope';

export interface RemoteBotModeScope extends BotModeScope {
  refresh(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSortMode(value: unknown): value is BotModeSortMode {
  return BOT_MODE_SORT_MODES.some((mode) => mode === value);
}

function sortModesOf(value: unknown): Record<string, BotModeSortMode> {
  return Object.fromEntries(
    Object.entries(record(value)).filter((entry): entry is [string, BotModeSortMode] =>
      isSortMode(entry[1]),
    ),
  );
}

function settingsOf(value: unknown): BotModeSettings {
  const fields = record(value);
  return {
    developerMode: DEFAULT_BOT_MODE_DEVELOPER,
    motionPreference: DEFAULT_BOT_MODE_MOTION,
    botIcon: DEFAULT_BOT_MODE_ICON,
    ...fields,
    sortMode: isSortMode(fields['sortMode']) ? fields['sortMode'] : DEFAULT_BOT_MODE_SORT,
    sortModes: sortModesOf(fields['sortModes']),
  };
}

export function remoteBotModeScope(call: BridgeCall): RemoteBotModeScope {
  const settings = hostSettingsScope(bridgeHost(call), BOT_MODE_NAMESPACE);
  let snapshot: BotModeScopeSnapshot = {
    status: 'loading',
    value: undefined,
    user: undefined,
    writable: false,
    mode: 'host',
  };
  const project = (): BotModeScopeSnapshot => {
    const current = settings.getSnapshot();
    if (current.status === 'ready')
      return {
        status: 'ready',
        value: settingsOf(current.value),
        user: undefined,
        writable: true,
        mode: 'host',
      };
    if (current.status === 'unavailable')
      return { ...snapshot, status: 'unavailable', writable: false };
    return snapshot;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) =>
      settings.subscribe(() => {
        snapshot = project();
        listener();
      }),
    refresh: async () => {
      await settings.refresh();
      snapshot = project();
    },
    set: async (field, value) => {
      const done = await settings.write('settings/update', { patch: { [field]: value } });
      snapshot = project();
      return done;
    },
    mutate: async (ops: readonly BotModePathOp[], expectedRevision?: number) => {
      const done = await settings.write('settings/mutate', {
        ops,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });
      snapshot = project();
      return done;
    },
  };
}

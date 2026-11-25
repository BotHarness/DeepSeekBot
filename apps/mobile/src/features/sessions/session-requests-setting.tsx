import { useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { describeHostSettings, updateHostSettings } from '@botharness/host-client/host-settings';
import {
  BOT_MODE_NAMESPACE,
  DEFAULT_NATIVE_SESSION_ATTENTION,
  NATIVE_SESSION_ATTENTION_FIELD,
} from '@botharness/host-client/shared/bot-mode-settings';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { SHEET_GROUP } from '../../ui/chat/sheet';
import type { LayerName } from '../../ui/design/layers';
import { SettingsRow, SettingsSection } from '../../ui/primitives/settings-row';
import { useStrings } from '../../ui/strings';

export type SessionRequestsState =
  | { status: 'loading' }
  | { status: 'ready'; value: boolean; revision: unknown; saving: boolean; failed: boolean }
  | { status: 'unavailable' };

type Store = {
  getSnapshot(): SessionRequestsState;
  subscribe(listener: () => void): () => void;
  set(value: boolean): Promise<void>;
};

const LOADING: SessionRequestsState = { status: 'loading' };
const IDLE: Store = {
  getSnapshot: () => LOADING,
  subscribe: () => () => {},
  set: async () => {},
};
const stores = new WeakMap<HostClient, Store>();

function fieldOf(value: Record<string, unknown>): boolean {
  const field = value[NATIVE_SESSION_ATTENTION_FIELD];
  return typeof field === 'boolean' ? field : DEFAULT_NATIVE_SESSION_ATTENTION;
}

export function sessionRequestsStore(client: HostClient): Store {
  const existing = stores.get(client);
  if (existing !== undefined) return existing;
  let state: SessionRequestsState = LOADING;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: SessionRequestsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const read = async (failed: boolean) => {
    const at = ++generation;
    try {
      const found = (await describeHostSettings(client)).find(
        (entry) => entry.ns === BOT_MODE_NAMESPACE,
      );
      if (at !== generation) return;
      publish(
        found === undefined
          ? { status: 'unavailable' }
          : {
              status: 'ready',
              value: fieldOf(found.value),
              revision: found.revision,
              saving: false,
              failed,
            },
      );
    } catch {
      if (at === generation) publish({ status: 'unavailable' });
    }
  };
  const store: Store = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) void read(false);
      return () => {
        listeners.delete(listener);
      };
    },
    async set(value) {
      const before = state;
      if (before.status !== 'ready' || before.saving) return;
      const at = ++generation;
      publish({ ...before, value, saving: true, failed: false });
      try {
        const saved = await updateHostSettings(
          client,
          BOT_MODE_NAMESPACE,
          { [NATIVE_SESSION_ATTENTION_FIELD]: value },
          before.revision,
        );
        if (at !== generation) return;
        publish({
          status: 'ready',
          value: fieldOf(saved.value),
          revision: saved.revision,
          saving: false,
          failed: false,
        });
      } catch {
        if (at !== generation) return;
        publish({ ...before, saving: false, failed: true });
        await read(true);
      }
    },
  };
  stores.set(client, store);
  return store;
}

export function SessionRequestsSetting({ on = SHEET_GROUP }: { on?: LayerName }) {
  const t = useStrings().hostSessions.requests;
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const connected = snapshot.connection.status === 'connected';
  const owner = saved != null && saved.member === undefined;
  const store = client !== undefined && owner && connected ? sessionRequestsStore(client) : IDLE;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (state.status !== 'ready') return null;
  return (
    <SettingsSection on={on} footer={t.footer}>
      <SettingsRow
        on={on}
        title={t.title}
        icon="notifications"
        {...(state.failed ? { detail: t.failed } : {})}
        control={{
          kind: 'switch',
          value: state.value,
          onChange: (value) => void store.set(value).then(() => inbox?.refresh()),
          disabled: state.saving,
          testID: 'session-requests-toggle',
        }}
      />
    </SettingsSection>
  );
}

import { useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { hostSettingsScope } from '@botharness/host-client/host-settings-scope';
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
const UNAVAILABLE: SessionRequestsState = { status: 'unavailable' };
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
  const settings = hostSettingsScope(client, BOT_MODE_NAMESPACE);
  let saving: boolean | undefined;
  let failed = false;
  let state: SessionRequestsState = LOADING;
  const listeners = new Set<() => void>();
  const project = (): SessionRequestsState => {
    const current = settings.getSnapshot();
    if (current.status !== 'ready') return current.status === 'loading' ? LOADING : UNAVAILABLE;
    return {
      status: 'ready',
      value: saving ?? fieldOf(current.value),
      revision: current.revision,
      saving: saving !== undefined,
      failed,
    };
  };
  const publish = () => {
    state = project();
    for (const listener of [...listeners]) listener();
  };
  settings.subscribe(publish);
  const store: Store = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) void settings.refresh();
      return () => {
        listeners.delete(listener);
      };
    },
    async set(value) {
      if (state.status !== 'ready' || state.saving) return;
      saving = value;
      failed = false;
      publish();
      const done = await settings.write('settings/update', {
        patch: { [NATIVE_SESSION_ATTENTION_FIELD]: value },
      });
      saving = undefined;
      failed = !done;
      publish();
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

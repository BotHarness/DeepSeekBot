// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingSnapshot, MessagingReadMode } from '../../core/src/messaging/outbound.js';
import { refreshMessaging, useMessagingSnapshot } from '../src/client/messaging-store.js';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const value = (name: string, checks: 'pending' | 'complete'): MessagingSnapshot => ({
  accounts: [],
  grants: [],
  intents: [],
  channelTargets: [{ id: 'group', name }],
  checks,
});
type Actions = {
  messagingSnapshot(slug: string, mode?: MessagingReadMode): Promise<MessagingSnapshot>;
};
function Probe({ actions }: { actions: Actions }) {
  const { snapshot, failed, mount, discover, refresh } = useMessagingSnapshot('same-bot', actions);
  return createElement(
    'div',
    { ref: mount },
    `${snapshot?.channelTargets?.[0]?.name ?? 'empty'}:${snapshot?.checks ?? 'empty'}:${failed}`,
    createElement('button', { onClick: () => void discover() }, 'Discover'),
    createElement('button', { onClick: () => void refresh() }, 'Refresh'),
  );
}

it('renders saved settings while status is pending and coalesces concurrent views in one scope', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const live = deferred<MessagingSnapshot>();
  const actions = {
    messagingSnapshot: vi.fn(async (_slug: string, mode?: MessagingReadMode) =>
      mode === 'saved' ? value('Saved', 'pending') : live.promise,
    ),
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(Probe, { actions }),
          createElement(Probe, { actions }),
        ),
      ),
    );
    expect(container.textContent).toContain('Saved:pending:false');
    expect(actions.messagingSnapshot.mock.calls.map((call) => call[1])).toEqual([
      'saved',
      'status',
    ]);
    await act(async () => live.resolve(value('Checked', 'complete')));
    expect(container.textContent).toContain('Checked:complete:false');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('discovers apps only on request and keeps discovery available until the last view closes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const actions = {
    messagingSnapshot: vi.fn(async (_slug: string, mode?: MessagingReadMode) =>
      value(mode ?? 'catalog', mode === 'saved' ? 'pending' : 'complete'),
    ),
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () => root.render(createElement(Probe, { actions })));
    await act(async () => container.querySelectorAll('button')[0]!.click());
    expect(container.textContent).toContain('catalog:complete');
    await act(async () => container.querySelectorAll('button')[1]!.click());
    expect(actions.messagingSnapshot.mock.calls.map((call) => call[1])).toEqual([
      'saved',
      'status',
      undefined,
      undefined,
    ]);
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(Probe, { actions })));
    expect(actions.messagingSnapshot.mock.calls.slice(-2).map((call) => call[1])).toEqual([
      'saved',
      'status',
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('does not surface a superseded shared read error over a fresh successful snapshot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const old = deferred<MessagingSnapshot>();
  let fresh = false;
  const actions: Actions = {
    messagingSnapshot: async (_slug, mode) =>
      mode === 'saved'
        ? value('Saved', 'pending')
        : fresh
          ? value('Fresh', 'complete')
          : old.promise,
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(Probe, { actions }),
          createElement(Probe, { actions }),
        ),
      ),
    );
    fresh = true;
    await act(async () =>
      refreshMessaging('same-bot', actions, { progressive: true, invalidate: true }),
    );
    await act(async () => old.reject(Error('superseded')));
    expect(container.textContent).not.toContain(':true');
    expect(container.textContent).toContain('Fresh:complete:false');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('rereads saved settings on reopen and rejects responses from the closed view', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const old = deferred<MessagingSnapshot>();
  const fresh = deferred<MessagingSnapshot>();
  let reopened = false;
  const actions: Actions = {
    messagingSnapshot: async (_slug, mode) =>
      mode === 'saved'
        ? value(reopened ? 'New configuration' : 'Old configuration', 'pending')
        : reopened
          ? fresh.promise
          : old.promise,
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () => root.render(createElement(Probe, { actions })));
    expect(container.textContent).toContain('Old configuration');
    reopened = true;
    await act(async () => root.render(createElement(Probe, { actions, key: 'replacement' })));
    expect(container.textContent).toContain('New configuration:pending');
    await act(async () => old.resolve(value('STALE', 'complete')));
    expect(container.textContent).not.toContain('STALE');
    await act(async () => fresh.resolve(value('New checked', 'complete')));
    expect(container.textContent).toContain('New checked:complete');
  } finally {
    old.resolve(value('closed', 'complete'));
    fresh.resolve(value('closed', 'complete'));
    await act(async () => root.unmount());
    container.remove();
  }
});

it('isolates equal Bot ids across Host/Human action scopes and ignores an invalidated response', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const oldLive = deferred<MessagingSnapshot>();
  const freshLive = deferred<MessagingSnapshot>();
  let revision = 0;
  const a: Actions = {
    messagingSnapshot: async (_slug, mode) =>
      mode === 'saved'
        ? value(`A${revision}`, 'pending')
        : revision
          ? freshLive.promise
          : oldLive.promise,
  };
  const b: Actions = { messagingSnapshot: async () => value('Host B', 'complete') };
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  try {
    await act(async () => root.render(createElement(Probe, { actions: a })));
    expect(container.textContent).toContain('A0:pending');
    revision = 1;
    let refreshing: Promise<void>;
    await act(async () => {
      refreshing = refreshMessaging('same-bot', a, { progressive: true, invalidate: true });
    });
    expect(container.textContent).toContain('A1:pending');
    await act(async () => oldLive.resolve(value('STALE', 'complete')));
    expect(container.textContent).not.toContain('STALE');
    await act(async () => root.render(createElement(Probe, { actions: b })));
    expect(container.textContent).toContain('Host B:complete');
    await act(async () => {
      freshLive.resolve(value('A1 live', 'complete'));
      await refreshing!;
    });
    expect(container.textContent).not.toContain('A1');
    expect(container.textContent).toContain('Host B:complete');
  } finally {
    oldLive.resolve(value('closed', 'complete'));
    freshLive.resolve(value('closed', 'complete'));
    await act(async () => root.unmount());
    container.remove();
  }
});

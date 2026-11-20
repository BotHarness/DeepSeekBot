// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore, type BotSummary } from '../src/client/store.js';
import { useStoreSlice, keepClientState } from '../src/client/use-client-store.js';
import {
  clearConversationDrafts,
  conversationDraftKey,
  useComposerRecovery,
} from '../src/client/conversation-draft.js';
import { ComposerDraftStore, type ComposerDraft } from '../src/client/composer-draft-store.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  clearConversationDrafts();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function fixture(draft: Partial<ComposerDraft> = { text: 'retained draft' }) {
  const client = createStore();
  const identity = { hostId: 'host', profileId: 'profile', humanId: 'human' };
  const bots: BotSummary[] = [
    {
      slug: 'bot',
      displayName: 'Bot',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    },
  ];
  const channels = ['a', 'b'].map((id) => ({
    id,
    type: 'group',
    name: id,
    members: ['bot'],
    createdAt: '',
    updatedAt: '',
  }));
  const pending: Array<{
    resolve: (value: Awaited<ReturnType<BridgeCall>>) => void;
    reject: (reason: Error) => void;
  }> = [];
  let identityFails = false;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'composerValidate')
      return await new Promise<Awaited<ReturnType<BridgeCall>>>((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    if (method === 'composerIdentity' && identityFails) throw new Error('identity unavailable');
    const values: Record<string, unknown> = {
      composerIdentity: identity,
      channels: { channels },
      list: { bots },
      rosterGet: { pins: [], hidden: [], muted: [], sections: [], topOrder: [] },
    };
    if (!(method in values)) throw new Error(`unexpected ${method}`);
    return { ok: true, value: structuredClone(values[method]) };
  });
  const actions = createActions(call, client);
  await actions.refreshRoster();
  client.select({ kind: 'channel', channelId: 'a' });
  expect(conversationDraftKey(client.getSnapshot())).toBeDefined();
  const scope = conversationDraftKey(client.getSnapshot())!;
  new ComposerDraftStore(localStorage, 'previous-page').update(scope, draft);
  let recovery: ReturnType<typeof useComposerRecovery>;
  let nodeKey = 0;
  function View() {
    const state = useStoreSlice(client, keepClientState);
    recovery = useComposerRecovery(conversationDraftKey(state), client.getSnapshot, actions);
    return createElement(
      'div',
      { key: nodeKey, ref: recovery.mount, 'data-blocked': recovery.blocked },
      recovery.draft.text,
    );
  }
  await act(async () => root.render(createElement(View)));
  expect(pending.length).toBe(1);
  const finish = async () => {
    await act(async () => {
      for (const request of pending) request.resolve({ ok: true, value: { attachments: [] } });
    });
  };
  return {
    client,
    actions,
    bots,
    channels,
    pending,
    finish,
    get recovery() {
      return recovery!;
    },
    identityFails: (value: boolean) => {
      identityFails = value;
    },
    remount: async () => {
      nodeKey++;
      await act(async () => root.render(createElement(View)));
    },
  };
}

it('settles after a production refreshRoster while validation is pending', async () => {
  const f = await fixture();
  const before = f.client.getSnapshot();
  f.bots[0] = { ...f.bots[0]!, displayName: 'Renamed Bot' };
  f.channels[1] = { ...f.channels[1]!, updatedAt: 'later' };
  await act(async () => f.actions.refreshRoster());
  expect(f.client.getSnapshot().bots).not.toBe(before.bots);
  expect(f.client.getSnapshot().channels).not.toBe(before.channels);
  expect(f.pending).toHaveLength(1);
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
  expect(container.textContent).toBe('retained draft');
});

it('finishes a restored draft validation while unrelated roster updates continue', async () => {
  const f = await fixture();
  const original = f.pending[0]!;
  const scope = conversationDraftKey(f.client.getSnapshot());
  const draft = f.recovery.draft;
  await act(async () => f.actions.refreshRoster());
  expect(conversationDraftKey(f.client.getSnapshot())).toBe(scope);
  expect(f.recovery.draft).toBe(draft);
  await act(async () => original.resolve({ ok: true, value: { attachments: [] } }));
  expect(f.recovery.blocked).toBe(false);
  expect(container.textContent).toBe('retained draft');
});

it('checks restored channel references against the roster at completion', async () => {
  const f = await fixture({
    text: '#b',
    channelRefs: [{ channelId: 'b', label: 'b', start: 0, end: 2 }],
  });
  await act(async () => {
    const state = f.client.getSnapshot();
    f.client.setRoster(
      state.bots,
      state.channels.filter((channel) => channel.id !== 'b'),
    );
  });
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
  expect(f.recovery.draft.channelRefs).toEqual([]);
  expect(f.recovery.notice).toBe(true);
  expect(container.textContent).toBe('#b');
});

it('drops a restored mention when its Bot pauses during validation', async () => {
  const f = await fixture({
    text: '@Bot',
    mentions: [{ botSlug: 'bot', label: 'Bot', start: 0, end: 4 }],
  });
  await act(async () => {
    const state = f.client.getSnapshot();
    f.client.setRoster(
      state.bots.map((bot) => ({ ...bot, paused: true })),
      state.channels,
    );
  });
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
  expect(f.recovery.draft.mentions).toEqual([]);
  expect(f.recovery.notice).toBe(true);
  expect(container.textContent).toBe('@Bot');
});

it('settles after switching away and back during validation', async () => {
  const f = await fixture();
  await act(async () => f.client.select({ kind: 'channel', channelId: 'b' }));
  await act(async () => f.client.select({ kind: 'channel', channelId: 'a' }));
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
  expect(container.textContent).toBe('retained draft');
});

it('settles after the actual callback-ref node is replaced', async () => {
  const f = await fixture();
  await f.remount();
  expect(f.pending).toHaveLength(2);
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
});

it('shows rejection and permits an explicit retry to settle', async () => {
  const f = await fixture();
  await act(async () => f.pending[0]!.reject(new Error('request interrupted')));
  expect(f.recovery.validationFailed).toBe(true);
  expect(f.recovery.blocked).toBe(true);
  await act(async () => f.recovery.retry());
  expect(f.pending).toHaveLength(2);
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
  expect(f.recovery.validationFailed).toBe(false);
});

it('distinguishes failed identity refresh from pending reference validation', async () => {
  const f = await fixture();
  f.identityFails(true);
  await act(async () => f.actions.refreshRoster());
  await f.finish();
  expect(conversationDraftKey(f.client.getSnapshot())).toBeUndefined();
  expect(f.recovery.blocked).toBe(true);
  expect(f.recovery.needsValidation).toBe(false);
  f.identityFails(false);
  await act(async () => f.actions.refreshRoster());
  await f.finish();
  expect(f.recovery.blocked).toBe(false);
});

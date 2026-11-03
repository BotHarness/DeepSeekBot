// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';
import {
  clearConversationDrafts,
  conversationDraftKey,
  useComposerRecovery,
} from '../src/client/conversation-draft.js';
import { createStore } from '../src/client/store.js';
import type { BridgeActions } from '../src/client/actions.js';

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

function state() {
  const client = createStore();
  client.setComposerIdentity({ hostId: 'host', profileId: 'profile', humanId: 'human' });
  client.setRoster(
    [],
    [{ id: 'group', type: 'group', name: 'Group', members: [], createdAt: '', updatedAt: '' }],
  );
  client.select({ kind: 'channel', channelId: 'group' });
  return client;
}

describe('composer recovery integration', () => {
  it('keeps text but disables restored references until canonical validation, then warns about lost targets', async () => {
    const current = state();
    const scope = conversationDraftKey(current.getSnapshot())!;
    new ComposerDraftStore(localStorage, 'previous-page').update(scope, {
      text: '@Gone #Gone',
      mentions: [{ botSlug: 'gone', label: 'Gone', start: 0, end: 5 }],
      channelRefs: [{ channelId: 'deleted', label: 'Gone', start: 6, end: 11 }],
      reply: { id: 'deleted-reply', author: { kind: 'human' }, body: '', at: '' },
      uploads: [
        { id: 'incomplete', file: new File(['not uploaded'], 'note.txt'), status: 'uploading' },
      ],
    });
    let finish: ((result: { attachments: [] }) => void) | undefined;
    const validate = vi.fn(
      () =>
        new Promise<{ attachments: [] }>((resolve) => {
          finish = resolve;
        }),
    );
    const actions = { validateComposerDraft: validate } as unknown as BridgeActions;
    function View() {
      const recovery = useComposerRecovery(scope, current.getSnapshot, actions);
      return createElement(
        'div',
        { ref: recovery.mount, 'data-blocked': recovery.blocked, 'data-notice': recovery.notice },
        `${recovery.draft.text}|${recovery.draft.mentions.length}|${recovery.draft.channelRefs.length}|${recovery.draft.reply?.id ?? ''}|${recovery.draft.uploads[0]?.status}`,
      );
    }
    await act(async () => root.render(createElement(View)));
    expect(container.firstElementChild?.getAttribute('data-blocked')).toBe('true');
    expect(validate).toHaveBeenCalledWith('group', [], 'deleted-reply');
    await act(async () => finish?.({ attachments: [] }));
    expect(container.textContent).toBe('@Gone #Gone|0|0||error');
    expect(container.firstElementChild?.getAttribute('data-blocked')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-notice')).toBe('true');
  });
  it('surfaces remote conflicts through storage events without replacing the current editor', async () => {
    const current = state();
    const scope = conversationDraftKey(current.getSnapshot())!;
    const second = new ComposerDraftStore(localStorage, 'second-tab');
    second.read(scope);
    const actions = {
      validateComposerDraft: vi.fn(async () => ({ attachments: [] })),
    } as unknown as BridgeActions;
    let edit: (() => void) | undefined;
    function View() {
      const recovery = useComposerRecovery(scope, current.getSnapshot, actions);
      edit = () => {
        recovery.setEditing(true);
        recovery.update({ text: 'current editor' });
      };
      return createElement(
        'div',
        { ref: recovery.mount },
        `${recovery.draft.text}|${recovery.versions.length}|${recovery.blocked}`,
      );
    }
    await act(async () => root.render(createElement(View)));
    act(() => edit?.());
    second.update(scope, { text: 'other tab' });
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: localStorage.key(0), storageArea: localStorage }),
      ),
    );
    expect(container.textContent).toBe('current editor|2|true');
  });
});

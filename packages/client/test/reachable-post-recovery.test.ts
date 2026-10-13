// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { OutboxIntent } from '../../core/src/messaging/outbound.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Modal: ({ open, children, footer }: PropsWithChildren<{ open: boolean; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog' }, children, footer) : null,
}));
import { ReachablePostDialog } from '../src/client/reachable-post.js';
import { ReachablePostRequests } from '../src/client/reachable-post-requests.js';
import { zhTranslate } from '../src/client/locale.js';
import { chooseOption } from './primitive-mocks.js';

function intent(state: OutboxIntent['state'] = 'provider-accepted'): OutboxIntent {
  return {
    id: 'intent',
    botSlug: 'ada',
    grantId: 'grant',
    grantRevision: 1,
    text: 'One report',
    state,
    report: {
      providerId: 'dsh-im/feishu',
      accountRef: 'qa',
      fingerprint: 'a'.repeat(64),
      platform: 'feishu',
      accountName: 'QA app',
      targetName: 'New QA group',
      conversationId: 'oc_new',
    },
    createdAt: '2026-10-13T00:00:00Z',
  };
}

async function fixture(
  post: NonNullable<BridgeActions['messagingPostConversation']>,
  refresh = async () => {},
  read?: BridgeActions['messagingPostRequest'],
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const identity = {
    id: crypto.randomUUID(),
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    platform: 'feishu',
    accountRef: 'qa',
    fingerprint: 'a'.repeat(64),
    name: 'QA app',
    enabled: true,
    revision: 1,
    newConversations: 'auto' as const,
    createdAt: '2026-10-13T00:00:00Z',
    availability: 'available' as const,
    grantCount: 0,
    scopes: [],
  };
  const render = () =>
    act(async () =>
      root.render(
        createElement(ReachablePostDialog, {
          slug: 'ada',
          recoveryScope: 'qa-test-owner',
          identity,
          t: zhTranslate,
          refresh,
          onClose: () => root.render(null),
          actions: {
            messagingReachable: async () => ({
              version: 1 as const,
              conversations: [{ id: 'oc_new', kind: 'group' as const, name: 'New QA group' }],
              hasMore: false,
            }),
            messagingPostConversation: post,
            ...(read ? { messagingPostRequest: read } : {}),
            messagingPostLimit: async () => {},
          },
        }),
      ),
    );
  const text = async (value: string) =>
    act(async () => {
      const input = host.querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const send = () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === '主动发送')!;
  const close = () =>
    act(async () =>
      [...host.querySelectorAll('button')].find((button) => button.textContent === '关闭')!.click(),
    );
  await render();
  await chooseOption('选择群聊', 'oc_new', host);
  await text('One report');
  return {
    host,
    render,
    text,
    send,
    close,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it('keeps an unknown result across close/reopen and returning to the same message', async () => {
  const post = vi.fn(async () => intent('unknown-outcome'));
  const view = await fixture(post);
  try {
    await act(async () => view.send().click());
    await view.close();
    await view.render();
    expect(view.host.querySelector('textarea')?.value).toBe('One report');
    expect(view.send().disabled).toBe(true);
    expect(view.host.textContent).toContain(zhTranslate('proactive.unknown'));
    await view.text('Different report');
    expect(view.send().disabled).toBe(false);
    await view.text(' One report ');
    expect(view.send().disabled).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    await view.dispose();
  }
});

it('reconciles a lost response with its original ID after reopen, then permits a distinct explicit send', async () => {
  const ids: string[] = [];
  const post: NonNullable<BridgeActions['messagingPostConversation']> = async (
    _slug,
    _binding,
    _group,
    id,
  ) => {
    ids.push(id);
    if (ids.length === 1) throw new Error('Response lost after Host acceptance');
    return intent();
  };
  const view = await fixture(post);
  try {
    await act(async () => view.send().click());
    await view.close();
    await view.render();
    await act(async () => view.send().click());
    expect(ids[1]).toBe(ids[0]);
    await act(async () => view.send().click());
    expect(ids[2]).not.toBe(ids[0]);
  } finally {
    await view.dispose();
  }
});

it('records a receipt even when the dialog was closed during the send', async () => {
  let resolve: ((value: OutboxIntent) => void) | undefined;
  const post = vi.fn(
    () =>
      new Promise<OutboxIntent>((done) => {
        resolve = done;
      }),
  );
  const view = await fixture(post);
  try {
    await act(async () => view.send().click());
    await view.close();
    await view.render();
    expect(view.send().disabled).toBe(true);
    await act(async () => resolve!(intent()));
    expect(view.host.textContent).toContain(zhTranslate('proactive.accepted'));
    expect(view.send().disabled).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    await view.dispose();
  }
});

it('preserves acceptance when refreshing the conversation list fails', async () => {
  const view = await fixture(
    async () => intent(),
    async () => {
      throw new Error('Snapshot disconnected');
    },
  );
  try {
    await act(async () => view.send().click());
    expect(view.host.textContent).toContain(zhTranslate('proactive.accepted'));
    expect(view.host.textContent).toContain(zhTranslate('proactive.refreshError'));
    expect(view.host.textContent).not.toContain(zhTranslate('proactive.sendError'));
  } finally {
    await view.dispose();
  }
});

it('reconciles the original Outbox result on reopen through a read-only query, without posting', async () => {
  const post = vi.fn<NonNullable<BridgeActions['messagingPostConversation']>>(async () => {
    throw new Error('Response lost');
  });
  const read = vi.fn<NonNullable<BridgeActions['messagingPostRequest']>>(async () => intent());
  const view = await fixture(post, async () => {}, read);
  try {
    await act(async () => view.send().click());
    const requestId = post.mock.calls[0]?.[3];
    await view.close();
    await view.render();
    expect(read.mock.calls.at(-1)?.[3]).toBe(requestId);
    expect(view.host.textContent).toContain(zhTranslate('proactive.accepted'));
    expect(view.send().disabled).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    await view.dispose();
  }
});

it('reads an in-flight result until settled without retrying the native effect', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const post = vi.fn(async () => {
    throw new Error('Response lost');
  });
  let state: OutboxIntent['state'] = 'in-flight';
  const read = vi.fn(async () => intent(state));
  const view = await fixture(post, async () => {}, read);
  try {
    await act(async () => view.send().click());
    await view.close();
    await view.render();
    expect(view.send().disabled).toBe(true);
    state = 'provider-accepted';
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(view.host.textContent).toContain(zhTranslate('proactive.accepted'));
    expect(view.send().disabled).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    await view.dispose();
    vi.useRealTimers();
  }
});

it('restores pending/lost request identity across a Client reload without automatically sending', () => {
  const scope = crypto.randomUUID();
  const store = new ReachablePostRequests(scope, sessionStorage);
  const request = store.begin('oc_new', 'One report');
  const restored = new ReachablePostRequests(scope, sessionStorage);
  expect(restored.last?.state).toBe('response-lost');
  expect(restored.begin('oc_new', 'One report').id).toBe(request.id);
  restored.finish(request, 'unknown-outcome');
  const unknown = new ReachablePostRequests(scope, sessionStorage);
  expect(() => unknown.begin('oc_new', 'One report')).toThrow('must not be resent');
});

it('refuses effects when recovery storage is corrupt or cannot preserve the request', () => {
  const scope = crypto.randomUUID();
  sessionStorage.setItem(`botharness.reachable-post.v1:${scope}`, 'broken');
  expect(() => new ReachablePostRequests(scope, sessionStorage).begin('oc_new', 'report')).toThrow(
    'unavailable',
  );
  const storage: Storage = {
    length: 0,
    clear() {},
    key: () => null,
    removeItem() {},
    getItem: () => null,
    setItem: () => {
      throw new Error('Full');
    },
  };
  expect(() => new ReachablePostRequests('full', storage).begin('oc_new', 'report')).toThrow(
    'unavailable',
  );
});

it('does not let late responses downgrade a receipt or replace a newer explicit request', () => {
  const store = new ReachablePostRequests(crypto.randomUUID(), sessionStorage);
  const first = store.begin('oc_new', 'One report');
  store.finish(first, 'provider-accepted');
  const second = store.begin('oc_new', 'One report');
  store.finish(first, 'response-lost');
  expect(store.read('oc_new', 'One report')?.id).toBe(second.id);
  expect(store.read('oc_new', 'One report')?.state).toBe('pending');
  store.finish(second, 'unknown-outcome');
  store.finish(second, 'grant-revoked');
  expect(store.read('oc_new', 'One report')?.state).toBe('unknown-outcome');
});

it('never evicts unknown requests when recovery reaches its bound', () => {
  const store = new ReachablePostRequests(crypto.randomUUID(), sessionStorage);
  for (let index = 0; index < 50; index++) {
    const request = store.begin('oc_new', `Report ${index}`);
    store.finish(request, 'unknown-outcome');
  }
  expect(() => store.begin('oc_new', 'Next report')).toThrow('full');
  expect(() => store.begin('oc_new', 'Report 0')).toThrow('must not be resent');
});

// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children?: ReactNode;
    variant?: string;
    size?: string;
  }) => createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { humanInboxSnoozeUntil } from '../src/client/human-inbox-snooze.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

const approval = (slug: string): HumanAttentionItem => ({
  id: 'approval:' + slug,
  category: 'action',
  kind: 'tool-approval',
  channelId: 'dm-' + slug,
  channelName: slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  sourceEventId: 'event-' + slug,
  summary: 'Approve bash for ' + slug,
  createdAt: '2026-10-01T12:00:00Z',
});
const grant: HumanAttentionItem = {
  ...approval('grace'),
  id: 'grant:grace',
  kind: 'workspace-grant-request',
};

const previous = store.getSnapshot();
afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setHumanInbox(previous.humanInbox);
  document.body.innerHTML = '';
});

async function mount(items: HumanAttentionItem[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: { items: [] } }), store),
    refreshHumanInbox: vi.fn(async () => undefined),
    dismissHumanInbox: vi.fn(async () => undefined),
    snoozeHumanInbox: vi.fn(async (_item: HumanAttentionItem, _until: string | null) => undefined),
    decideToolApproval: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    setHumanInboxFilters: vi.fn(async (filters) => store.setHumanInbox(filters)),
  } satisfies BridgeActions;
  store.select({ kind: 'inbox' });
  store.setHumanInbox({
    category: 'action',
    status: 'ready',
    items,
    botSlug: undefined,
    channelId: undefined,
    sort: 'oldest',
    snoozed: false,
  });
  await act(async () => root.render(createElement(HumanInboxView, { actions })));
  const press = async (key: string, target: Element = document.activeElement ?? document.body) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  return { host, actions, press, unmount: () => act(async () => root.unmount()) };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[role="listitem"]')];

describe('Human Inbox keyboard', () => {
  it('moves with J and K, marks handled with E and opens the source with Enter', async () => {
    const view = await mount([approval('ada'), grant]);
    await view.press('j');
    expect(document.activeElement).toBe(
      rows(view.host)[0]!.querySelector('.bh-human-inbox-row-open'),
    );
    await view.press('j');
    expect(rows(view.host)[1]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('k');
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('Enter');
    expect(view.actions.openBot).toHaveBeenCalledWith('ada');
    expect(view.actions.openAround).toHaveBeenCalledWith('dm-ada', 'request-ada');
    await view.press('e');
    expect(view.actions.dismissHumanInbox).toHaveBeenCalledWith(approval('ada'));
    await view.unmount();
  });

  it('leaves keys typed into fields and modified keys alone', async () => {
    const view = await mount([approval('ada')]);
    const field = document.createElement('input');
    view.host.querySelector('main')!.append(field);
    await view.press('e', field);
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }),
      );
    });
    expect(view.actions.dismissHumanInbox).not.toHaveBeenCalled();
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(false);
    await view.unmount();
  });

  it('stays still behind the shortcut list and lets ? through', async () => {
    const view = await mount([approval('ada')]);
    const question = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
    await act(async () => {
      document.body.dispatchEvent(question);
    });
    expect(question.defaultPrevented).toBe(false);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    await view.press('j', document.body);
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(false);
    dialog.remove();
    await view.press('j', document.body);
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(true);
    await view.unmount();
  });
});

describe('Human Inbox bulk actions', () => {
  it('selects with X and allows every selected tool approval once', async () => {
    const view = await mount([approval('ada'), approval('bo')]);
    await view.press('j');
    await view.press('x');
    await view.press('j');
    await view.press('x');
    const toolbar = view.host.querySelector('[role="toolbar"]')!;
    expect(toolbar.textContent).toContain('已选 2 项');
    const allow = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent === '批准这 2 个请求（仅一次）',
    )!;
    await act(async () => allow.click());
    expect(view.actions.decideToolApproval.mock.calls).toEqual([
      ['dm-ada', 'request-ada', 'allowed-once'],
      ['dm-bo', 'request-bo', 'allowed-once'],
    ]);
    expect(view.host.querySelector('[role="toolbar"]')!.textContent).not.toContain('已选');
    await view.unmount();
  });

  it('marks a mixed selection handled and only offers approval for approvals', async () => {
    const view = await mount([approval('ada'), grant]);
    const all = view.host.querySelector<HTMLInputElement>(
      '[role="toolbar"] input[type="checkbox"]',
    )!;
    await act(async () => all.click());
    const toolbar = view.host.querySelector('[role="toolbar"]')!;
    expect(toolbar.textContent).not.toContain('批准');
    const handle = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent === '标为已处理',
    )!;
    await act(async () => handle.click());
    expect(view.actions.dismissHumanInbox).toHaveBeenCalledTimes(2);
    expect(view.actions.decideToolApproval).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('Human Inbox snooze', () => {
  it('snoozes a row until the chosen time and lists snoozed items on request', async () => {
    const view = await mount([approval('ada')]);
    const button = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '稍后提醒',
    )!;
    await act(async () => button.click());
    const choice = view.host.querySelector<HTMLButtonElement>('[role="menu"] button')!;
    expect(choice.textContent).toBe('1 小时后');
    await act(async () => choice.click());
    const [item, until] = view.actions.snoozeHumanInbox.mock.calls[0]!;
    expect(item).toEqual(approval('ada'));
    expect(Date.parse(until as string) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    const toggle = view.host.querySelector<HTMLButtonElement>('.bh-human-inbox-snoozed-toggle')!;
    await act(async () => toggle.click());
    expect(view.actions.setHumanInboxFilters).toHaveBeenCalledWith(
      expect.objectContaining({ snoozed: true }),
    );
    await view.unmount();
  });

  it('brings a snoozed item back', async () => {
    const view = await mount([{ ...approval('ada'), snoozedUntil: '2099-01-01T01:00:00.000Z' }]);
    expect(view.host.textContent).toContain('回来');
    const cancel = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '取消延后',
    )!;
    await act(async () => cancel.click());
    expect(view.actions.snoozeHumanInbox).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approval:ada' }),
      null,
    );
    await view.unmount();
  });

  it('offers this evening only while it is still ahead and next week on Monday morning', () => {
    const friday = new Date(2026, 9, 16, 10, 0);
    expect(humanInboxSnoozeUntil('evening', friday)?.getHours()).toBe(18);
    expect(humanInboxSnoozeUntil('evening', new Date(2026, 9, 16, 17, 45))).toBeUndefined();
    const week = humanInboxSnoozeUntil('week', friday)!;
    expect([week.getDay(), week.getDate(), week.getHours()]).toEqual([1, 19, 9]);
    expect(humanInboxSnoozeUntil('tomorrow', friday)!.getDate()).toBe(17);
  });
});

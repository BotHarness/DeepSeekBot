// @vitest-environment jsdom
import { type ActivityListSource } from '../src/client/activity-list-view.js';
import { type HumanAttentionItem } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { ActivityListView } from '../src/client/activity-list-view.js';
import { activityListSnoozeUntil } from '../src/client/activity-list-snooze.js';
import { store } from '../src/client/store.js';
import { approval } from './support/activity-list-keyboard-batch.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/activity-list-keyboard-batch.js')).mockActivityPrimitives(),
);

vi.mock('../src/client/bot-sidebar.js', async () =>
  (await import('./support/activity-list-keyboard-batch.js')).mockActivitySidebar(),
);

const grant: HumanAttentionItem = {
  ...approval('grace'),
  id: 'grant:grace',
  kind: 'workspace-grant-request',
};

const previous = store.getSnapshot();

afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setActivityList(previous.activityList);
  document.body.innerHTML = '';
});

async function mount(items: HumanAttentionItem[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: { items: [] } }), store),
    refreshActivityList: vi.fn(async () => undefined),
    dismissActivityList: vi.fn(async () => undefined),
    snoozeActivityList: vi.fn(
      async (_item: HumanAttentionItem, _until: string | null) => undefined,
    ),
    decideToolApproval: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    setActivityListFilters: vi.fn(async (filters) => store.setActivityList(filters)),
  } satisfies BridgeActions;
  store.select({ kind: 'inbox' });
  store.setActivityList({
    category: 'action',
    status: 'ready',
    items,
    botSlug: undefined,
    channelId: undefined,
    sort: 'oldest',
    snoozed: false,
  });
  await act(async () => root.render(createElement(ActivityListView, { actions })));
  await act(async () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === '选择')!.click(),
  );
  const press = async (key: string, target: Element = document.activeElement ?? document.body) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  return { host, actions, press, unmount: () => act(async () => root.unmount()) };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[role="listitem"]')];

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function pendingSources(kind: 'channel-unread' | 'channel-reply') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const items: HumanAttentionItem[] = [
    {
      ...approval('tob'),
      id: 'same-id',
      kind,
      category: kind === 'channel-unread' ? 'unread' : 'replies',
      isUnread: true,
    },
    {
      ...approval('tob'),
      id: 'same-id',
      kind,
      category: kind === 'channel-unread' ? 'unread' : 'replies',
      isUnread: true,
      summary: 'Other Host',
    },
  ];
  const pending = [deferred(), deferred()];
  const actions = createActions(async () => ({ ok: true, value: { items: [] } }), store);
  const sources = items.map((_, index): ActivityListSource => ({
    hostId: 'host-' + index,
    commands: {
      ...actions,
      markRead: () => pending[index]!.promise,
      dismissActivityList: () => pending[index]!.promise,
      snoozeActivityList: () => pending[index]!.promise,
    },
    detail: () =>
      createElement('p', { 'data-source-detail': String(index) }, 'Host ' + index + ' detail'),
    botName: () => 'Host ' + index,
    isDirect: () => true,
    open: async () => {},
    sourceButton: () => null,
    refresh: async () => {},
    loadMore: async () => {},
  }));
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  await act(async () =>
    root.render(
      createElement(ActivityListView, {
        actions,
        inboxOverride: {
          ...previous.activityList,
          category: kind === 'channel-unread' ? 'unread' : 'replies',
          items,
          status: 'ready',
        },
        itemSource: (item) => sources[items.indexOf(item)],
      }),
    ),
  );
  const button = (index: number, label: string) =>
    [...rows(element)[index]!.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    )!;
  return {
    element,
    pending,
    button,
    close: () =>
      act(async () => {
        pending.forEach((value) => value.resolve());
        root.unmount();
        element.remove();
      }),
  };
}

it('keeps concurrent equal-ID reads on separate Hosts independently busy', async () => {
  const view = await pendingSources('channel-unread');
  try {
    await act(async () => view.button(0, '标为已读').click());
    await act(async () => view.button(1, '标为已读').click());
    expect(view.button(0, '标为已读').disabled).toBe(true);
    expect(view.button(1, '标为已读').disabled).toBe(true);
    await act(async () => view.pending[0]!.resolve());
    expect(view.button(0, '标为已读').disabled).toBe(false);
    expect(view.button(1, '标为已读').disabled).toBe(true);
    await act(async () => view.pending[1]!.resolve());
    expect(view.button(1, '标为已读').disabled).toBe(false);
  } finally {
    await view.close();
  }
});

it.each(['dismiss', 'snooze'])(
  'keeps a newly opened Host detail when an old %s finishes',
  async (operation) => {
    const view = await pendingSources('channel-reply');
    try {
      await act(async () =>
        rows(view.element)[0]!
          .querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!
          .click(),
      );
      expect(view.element.querySelector('[data-source-detail="0"]')).not.toBeNull();
      if (operation === 'dismiss') await act(async () => view.button(0, '移除').click());
      else {
        await act(async () => view.button(0, '稍后提醒').click());
        await act(async () =>
          document.body.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')!.click(),
        );
      }
      await act(async () =>
        rows(view.element)[1]!
          .querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!
          .click(),
      );
      await act(async () => view.pending[0]!.resolve());
      expect(view.element.querySelector('[data-source-detail="1"]')).not.toBeNull();
      expect(view.element.querySelector('[data-source-detail="0"]')).toBeNull();
    } finally {
      await view.close();
    }
  },
);

describe('Human Inbox keyboard', () => {
  it('moves with J and K, does not handle with E and opens the source with Enter', async () => {
    const view = await mount([approval('ada'), grant]);
    await view.press('j');
    expect(document.activeElement).toBe(
      rows(view.host)[0]!.querySelector('.bh-activity-list-row-open'),
    );
    await view.press('j');
    expect(rows(view.host)[1]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('k');
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('Enter');
    expect(view.actions.openBot).toHaveBeenCalledWith('ada');
    expect(view.actions.openAround).toHaveBeenCalledWith('dm-ada', 'request-ada');
    await view.press('e');
    expect(view.actions.dismissActivityList).not.toHaveBeenCalled();
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
    expect(view.actions.dismissActivityList).not.toHaveBeenCalled();
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
    expect(view.actions.dismissActivityList).toHaveBeenCalledTimes(2);
    expect(view.actions.decideToolApproval).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('Human Inbox snooze', () => {
  it('snoozes a selected row until the chosen time', async () => {
    const view = await mount([approval('ada')]);
    const button = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '稍后提醒',
    )!;
    await act(async () => button.click());
    const choice = document.body.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')!;
    expect(choice.textContent).toBe('1 小时后');
    await act(async () => choice.click());
    const [item, until] = view.actions.snoozeActivityList.mock.calls[0]!;
    expect(item).toEqual(approval('ada'));
    expect(Date.parse(until as string) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    await view.unmount();
  });

  it('brings a snoozed item back', async () => {
    const view = await mount([{ ...approval('ada'), snoozedUntil: '2099-01-01T01:00:00.000Z' }]);
    expect(view.host.textContent).toContain('回来');
    const cancel = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '取消延后',
    )!;
    await act(async () => cancel.click());
    expect(view.actions.snoozeActivityList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approval:ada' }),
      null,
    );
    await view.unmount();
  });

  it('offers this evening only while it is still ahead and next week on Monday morning', () => {
    const friday = new Date(2026, 9, 16, 10, 0);
    expect(activityListSnoozeUntil('evening', friday)?.getHours()).toBe(18);
    expect(activityListSnoozeUntil('evening', new Date(2026, 9, 16, 17, 45))).toBeUndefined();
    const week = activityListSnoozeUntil('week', friday)!;
    expect([week.getDay(), week.getDate(), week.getHours()]).toEqual([1, 19, 9]);
    expect(activityListSnoozeUntil('tomorrow', friday)!.getDate()).toBe(17);
  });
});

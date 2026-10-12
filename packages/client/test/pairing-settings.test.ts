// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  IconChevronDownOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
  SegmentedTabs: ({
    items,
    value,
    onChange,
  }: {
    items: { value: string; label: string; id: string; panelId: string }[];
    value: string;
    onChange(value: string): void;
  }) =>
    createElement(
      'div',
      { role: 'tablist' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.value,
            role: 'tab',
            'aria-selected': item.value === value,
            onClick: () => onChange(item.value),
          },
          item.label,
        ),
      ),
    ),
  Checkbox: ({
    checked,
    label,
    disabled,
    onChange,
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement(
      'label',
      null,
      createElement('input', {
        type: 'checkbox',
        checked,
        disabled,
        onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
      }),
      label,
    ),
}));
vi.mock('../src/client/messaging-help.js', () => ({
  MessagingHelp: ({ title }: { title: string }) =>
    createElement('button', { 'aria-label': `Info: ${title}` }, 'ⓘ'),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
    onClose,
  }: PropsWithChildren<{ open: boolean; title: string; footer: ReactNode; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children,
          createElement('button', { onClick: onClose }, 'Close'),
          footer,
        )
      : null,
}));
vi.mock('../src/client/combobox.js', () => ({
  Combobox: ({
    label,
    value,
    options,
    onSelect,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onSelect(value: string): void;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        onChange: (event: { target: { value: string } }) => onSelect(event.target.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
import { PairingSettings } from '../src/client/pairing-settings.js';
import { GroupDetails, GroupDialog } from '../src/client/permission-group-settings.js';
import {
  BehaviorPreview,
  BehaviorPermissionsPanel,
} from '../src/client/behavior-permission-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { PairingRequest } from '../../core/src/messaging/pairing.js';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const request: PairingRequest = {
  id: 'qa-request',
  reference: 'PAIRTEST',
  botSlug: 'ada',
  bindingId: 'lark-qa',
  accountName: 'QA Lark',
  actorId: 'ou_demo',
  actorName: 'Alice QA',
  conversationId: 'oc_demo',
  status: 'pending',
  capabilities: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  expiresAt: '2026-10-06T00:10:00.000Z',
  revision: 1,
  attempts: 1,
};

it('refuses an incompatible Group grant in the UI and enables save only after explicit Deny resolution', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  const a = {
    id: 'a',
    botSlug: 'ada',
    name: 'Public',
    behavior: 'Public answers.',
    excludes: ['b'],
    revision: 2,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  const b = { ...a, id: 'b', name: 'Private', behavior: 'Private answers.', excludes: ['a'] };
  const person = { ...request, purpose: 'conversation' as const, status: 'approved' as const };
  const group = {
    id: 'private',
    botSlug: 'ada',
    bindingId: person.bindingId,
    name: 'Private group',
    allow: [],
    deny: [],
    memberIds: [person.id],
    behaviorAllow: [b.id],
    revision: 1,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  try {
    await act(async () =>
      root.render(
        createElement(GroupDialog, {
          group,
          groups: [{ ...group, id: 'public', name: 'Public group', behaviorAllow: [a.id] }, group],
          behaviorPermissions: [a, b],
          people: [person],
          bindings: [{ id: person.bindingId, name: 'QA App' }],
          busy: false,
          change,
          close: () => {},
          t: zhTranslate,
        }),
      ),
    );
    const save = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.saveGroup'),
    )!;
    expect(save.disabled).toBe(true);
    const warning = host.querySelector('[role=alert]')!;
    expect(warning.textContent).toContain(person.actorName);
    expect(warning.textContent).toContain('Public ↔ Private');
    expect(warning.textContent).toContain('Public group');
    expect(warning.textContent).toContain('Private group');
    await act(async () => save.click());
    expect(change).not.toHaveBeenCalled();
    const deny = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent === '拒绝 · Public')!
      .querySelector('input')!;
    await act(async () => deny.click());
    expect(save.disabled).toBe(false);
    expect(host.querySelector('[role=alert]')).toBeNull();
    await act(async () => save.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        behaviorAllow: ['b'],
        behaviorDeny: ['a'],
        expectedBehaviorRevisions: { a: 2, b: 2 },
      }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('item editor includes a disabled-Binding person and previews bilateral exclusion removal with both endpoint revisions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  const a = {
    id: 'a',
    botSlug: 'ada',
    name: 'Public',
    behavior: 'Public answers.',
    excludes: ['b'],
    revision: 2,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  const b = { ...a, id: 'b', name: 'Private', excludes: ['a'], revision: 3 };
  const person = {
    ...request,
    purpose: 'conversation' as const,
    status: 'unavailable' as const,
    roleId: 'member',
  };
  const base = {
    botSlug: 'ada',
    bindingId: person.bindingId,
    allow: [],
    deny: [],
    memberIds: [person.id],
    revision: 1,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  try {
    await act(async () =>
      root.render(
        createElement(BehaviorPermissionsPanel, {
          items: [a, b],
          groups: [
            { ...base, id: 'public', name: 'Public group', behaviorAllow: ['a'] },
            { ...base, id: 'private', name: 'Private group', behaviorAllow: ['b'] },
          ],
          people: [person],
          busy: false,
          change,
          t: zhTranslate,
        }),
      ),
    );
    const button = (label: string) =>
      Array.from(host.querySelectorAll('button')).find((button) => button.textContent === label)!;
    await act(async () => button(zhTranslate('pairing.editBehaviorPermission')).click());
    const save = button(zhTranslate('pairing.saveBehaviorPermission'));
    expect(save.disabled).toBe(true);
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Public ↔ Private');
    const checkbox = host.querySelector('[role=dialog] table input[type=checkbox]')!;
    await act(async () => (checkbox as HTMLInputElement).click());
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'a',
        expectedRevision: 2,
        excludes: [],
        expectedExcludedRevisions: { b: 3 },
      }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('keeps an affected person visible when a draft removes their last behavior contribution', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        createElement(BehaviorPreview, {
          items: [],
          groups: [],
          people: [{ ...request, purpose: 'conversation', status: 'approved' }],
          t: zhTranslate,
        }),
      ),
    );
    expect(host.textContent).toContain(request.actorName);
    const toggle = host.querySelector<HTMLButtonElement>('.bh-behavior-preview-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.bh-behavior-preview-body')).toBeNull();
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.bh-behavior-preview-body')!.id).toBe(
      toggle.getAttribute('aria-controls'),
    );
    expect(host.textContent).toContain(zhTranslate('pairing.noBehaviorPermissions'));
    expect(host.textContent).not.toContain(zhTranslate('pairing.behaviorNoAffectedPeople'));
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.bh-behavior-preview-body')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('previews a cross-group behavior Deny conflict and saves stable item IDs with current revisions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  const item = {
    id: 'pricing-id',
    botSlug: 'ada',
    name: 'Pricing',
    behavior: 'Answer pricing questions.',
    revision: 2,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  const person = {
    ...request,
    purpose: 'conversation' as const,
    status: 'approved' as const,
    roleId: 'member',
  };
  const group = {
    id: 'support-id',
    botSlug: 'ada',
    bindingId: request.bindingId,
    name: 'Support',
    allow: [],
    deny: [],
    memberIds: [person.id],
    behaviorAllow: [item.id],
    behaviorDeny: [],
    revision: 3,
    createdAt: request.createdAt,
    updatedAt: request.createdAt,
  };
  try {
    await act(async () =>
      root.render(
        createElement(GroupDialog, {
          group,
          groups: [{ ...group, id: 'sales-id', name: 'Sales' }, group],
          behaviorPermissions: [item],
          people: [person],
          bindings: [{ id: request.bindingId, name: 'QA App' }],
          busy: false,
          change,
          close: () => {},
          t: zhTranslate,
        }),
      ),
    );
    const toggle = host.querySelector<HTMLButtonElement>('.bh-behavior-preview-toggle')!;
    expect(toggle.getAttribute('aria-label')).toContain(zhTranslate('pairing.behaviorNoConflict'));
    await act(async () => toggle.click());
    const table = host.querySelector('.bh-behavior-selection table')!;
    expect(table.querySelectorAll('th')).toHaveLength(3);
    expect(table.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
    expect(table.querySelector('.bh-pairing-name')).toBeNull();
    expect(table.querySelectorAll('label')[0]!.textContent).toBe('允许 · Pricing');
    const deny = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent === '拒绝 · Pricing')!
      .querySelector('input')!;
    await act(async () => deny.click());
    expect(table.querySelectorAll<HTMLInputElement>('input')[0]!.checked).toBe(false);
    expect(table.querySelectorAll<HTMLInputElement>('input')[1]!.checked).toBe(true);
    expect(toggle.getAttribute('aria-label')).toContain(zhTranslate('pairing.behaviorConflict'));
    expect(host.textContent).toContain(zhTranslate('pairing.behaviorConflictShort'));
    expect(host.textContent).toContain('Sales');
    expect(host.textContent).toContain('Support');
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.saveGroup'))!
        .click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'edit-group',
        id: group.id,
        expectedRevision: 3,
        behaviorAllow: [],
        behaviorDeny: [item.id],
        expectedBehaviorRevisions: { [item.id]: 2 },
      }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('deleting a group explains removal of Deny and requires confirmation with the current revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(GroupDetails, {
          group: {
            id: 'group-id',
            botSlug: 'ada',
            bindingId: 'lark-qa',
            name: 'Reviewers',
            allow: [],
            deny: ['approve'],
            memberIds: [],
            revision: 3,
            createdAt: request.createdAt,
            updatedAt: request.createdAt,
          },
          people: [],
          bindings: [],
          busy: false,
          change,
          t: zhTranslate,
        }),
      ),
    );
    const button = () =>
      Array.from(host.querySelectorAll('button')).find(
        (item) => item.textContent === zhTranslate('pairing.deleteGroup'),
      )!;
    await act(async () => button().click());
    expect(change).not.toHaveBeenCalled();
    const dialog = host.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain(zhTranslate('pairing.deleteGroupWarning'));
    await act(async () =>
      Array.from(dialog.querySelectorAll('button'))
        .find((item) => item.textContent === zhTranslate('pairing.deleteGroup'))!
        .click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith({
      kind: 'delete-group',
      id: 'group-id',
      expectedRevision: 3,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('group member selection is scoped to approved people and personal exceptions submit exact revisions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  const person = {
    ...request,
    purpose: 'conversation' as const,
    status: 'approved' as const,
    revision: 7,
    roleId: 'reader',
    effectivePermissions: { capabilities: [], deniedCapabilities: [], permissionSources: [] },
  };
  const button = (text: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === text)!;
  await act(async () =>
    root.render(
      createElement(PairingSettings, {
        requests: [
          person,
          { ...person, id: 'other', actorName: 'Other App', bindingId: 'other-app' },
        ],
        bindings: [{ id: 'lark-qa', name: 'QA Lark' }],
        busy: false,
        senderAccess: change,
        refresh: async () => {},
        review: async () => {},
        t: zhTranslate,
      }),
    ),
  );
  await act(async () => button('授权组 (0)').click());
  await act(async () => button('创建组').click());
  const dialog = host.querySelector('[role="dialog"]')!;
  await act(async () => button('组成员 (0)').click());
  expect(dialog.textContent).toContain('Alice QA');
  expect(dialog.textContent).not.toContain('Other App');
  const name = dialog.querySelector('input:not([type="checkbox"])')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(name, 'Reviewers');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const checkbox = (label: string) =>
    Array.from(dialog.querySelectorAll('label'))
      .find((item) => item.textContent?.includes(label))!
      .querySelector('input')!;
  await act(async () => button('管理能力').click());
  await act(async () => checkbox('允许 · 批准').click());
  await act(async () => button('组成员 (0)').click());
  await act(async () => checkbox('Alice QA').click());
  await act(async () => button('管理能力').click());
  expect(checkbox('允许 · 批准').checked).toBe(true);
  await act(async () => button('保存组').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'create-group',
    bindingId: 'lark-qa',
    name: 'Reviewers',
    allow: ['approve'],
    deny: [],
    delegateAllow: [],
    delegateDeny: [],
    memberIds: [person.id],
  });
  await act(async () => button('人员 (2)').click());
  await act(async () => button('个人权限例外').click());
  const exception = host.querySelector('[role="dialog"]')!;
  await act(async () =>
    Array.from(exception.querySelectorAll('label'))
      .find((item) => item.textContent?.includes('拒绝 · 批准'))!
      .querySelector('input')!
      .click(),
  );
  await act(async () => button('保存例外').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'person-permissions',
    id: person.id,
    expectedRevision: 7,
    allow: [],
    deny: ['approve'],
    delegateAllow: [],
    delegateDeny: [],
  });
  await act(async () => root.unmount());
  host.remove();
});

it('separate role editing and selected-person reassignment retain exact authority revisions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    change = vi.fn(async () => {});
  const role = {
    id: 'role-first',
    botSlug: 'ada',
    name: 'Reader',
    behavior: 'Read documentation.',
    capabilities: [],
    revision: 4,
  };
  const other = { ...role, id: 'role-second', name: 'Colleague', revision: 2 };
  const button = (key: Parameters<typeof zhTranslate>[0]) =>
    Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === zhTranslate(key),
    )!;
  const tab = (key: 'pairing.people' | 'pairing.roles') =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find((item) =>
      item.textContent?.startsWith(zhTranslate(key)),
    )!;
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [
            {
              ...request,
              status: 'approved',
              purpose: 'conversation',
              roleId: role.id,
              revision: 7,
            },
          ],
          roles: [role, other],
          policy: { restricted: true, revision: 3 },
          senderAccess: change,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    await act(async () => tab('pairing.roles').click());
    expect(host.querySelector('[role=dialog]')).toBeNull();
    await act(async () => button('pairing.editRole').click());
    const editor = host.querySelector('[role=dialog]')!;
    const permission = (label: string) =>
      Array.from(editor.querySelectorAll('label'))
        .find((item) => item.textContent === label)!
        .querySelector('input')!;
    await act(async () => permission('批准本次操作').click());
    await act(async () => permission('审核聊天配对').click());
    await act(async () => permission('允许委派 · 拒绝操作').click());
    await act(async () => button('pairing.saveRole').click());
    expect(change).toHaveBeenLastCalledWith({
      kind: 'edit-role',
      id: role.id,
      expectedRevision: 4,
      name: role.name,
      behavior: role.behavior,
      capabilities: ['approve', 'review-pairing'],
      delegableCapabilities: ['reject'],
    });
    expect(host.querySelector('[role=dialog]')).toBeNull();
    await act(async () => tab('pairing.people').click());
    expect(button('pairing.reassignRole').disabled).toBe(true);
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = other.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('pairing.reassignRole').click());
    expect(change).toHaveBeenLastCalledWith({
      kind: 'reassign-role',
      id: request.id,
      expectedRevision: 7,
      roleId: other.id,
      expectedRoleRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('search and person/time sorting filter actual rows without changing authority; unknown timestamps stay unknown', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const review = vi.fn(async () => {});
  const change = vi.fn(async () => {});
  const older = '2026-10-06T01:00:00.000Z';
  const newer = '2026-10-07T02:00:00.000Z';
  const names = () =>
    Array.from(host.querySelectorAll('.bh-pairing-name')).map((entry) => entry.textContent);
  const filter = async (value: string) =>
    act(async () => {
      const input = host.querySelector<HTMLInputElement>('.bh-pairing-table-panel input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [
            { ...request, status: 'approved', updatedAt: older },
            {
              ...request,
              id: 'bob',
              actorName: 'Bob QA',
              accountName: 'Other App',
              status: 'approved',
              updatedAt: newer,
            },
          ],
          roles: [
            {
              id: 'legacy',
              botSlug: 'ada',
              name: 'Legacy role',
              behavior: 'Read docs',
              capabilities: [],
              revision: 1,
            },
          ],
          senderAccess: change,
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(names()).toEqual(['Alice QA', 'Bob QA']);
    await filter('Other App');
    expect(names()).toEqual(['Bob QA']);
    await filter('Alice');
    expect(names()).toEqual(['Alice QA']);
    await filter('no-such-person');
    expect(names()).toEqual([]);
    expect(host.textContent).toContain(zhTranslate('pairing.noMatches'));
    await filter('');
    const nameHeader = host.querySelectorAll<HTMLTableCellElement>('th')[1]!;
    await act(async () => nameHeader.querySelector('button')!.click());
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    await act(async () => nameHeader.querySelector('button')!.click());
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Bob QA', 'Alice QA']);
    const timeHeader = host.querySelectorAll<HTMLTableCellElement>('th')[5]!;
    await act(async () => timeHeader.querySelector('button')!.click());
    expect(timeHeader.getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Bob QA', 'Alice QA']);
    await act(async () => timeHeader.querySelector('button')!.click());
    expect(names()).toEqual(['Alice QA', 'Bob QA']);
    expect(host.querySelector('.bh-pairing-times time')?.getAttribute('datetime')).toBe(
      request.createdAt,
    );
    expect(host.querySelectorAll('.bh-pairing-times time')).toHaveLength(4);
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
        .find((button) => button.textContent?.startsWith(zhTranslate('pairing.roles')))!
        .click(),
    );
    expect(host.querySelectorAll('.bh-pairing-times time')).toHaveLength(0);
    expect(host.querySelector('.bh-pairing-times')?.textContent).toContain('—');
    expect(host.querySelector('.bh-pairing-times span')?.getAttribute('title')).toContain(
      zhTranslate('pairing.timeUnknown'),
    );
    expect(review).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('selecting a different request cannot carry over approval capabilities or review the old person', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const review = vi.fn(async () => {});
  const second = { ...request, id: 'second', actorName: 'Bob QA', actorId: 'ou_bob', revision: 7 };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request, second],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.bh-pairing-name')[1]!.click());
    expect(review).not.toHaveBeenCalled();
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approve'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(host.querySelectorAll('tr[data-selected]')).toHaveLength(1);
    expect(host.querySelector('.bh-pairing-detail')!.textContent).toContain('Bob QA');
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: second.id,
      expectedRevision: 7,
      capabilities: ['approve'],
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('role creation opens separately and retains the input when the Host refuses it', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(async () => {
    throw new Error('conflict');
  });
  const fill = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [],
          roles: [],
          policy: { restricted: false, revision: 1 },
          senderAccess: change,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.createRole'))!
        .click(),
    );
    const dialog = host.querySelector('[role=dialog]')!;
    await act(async () => {
      fill(dialog.querySelector('input')!, 'Documentation');
      fill(dialog.querySelector('textarea')!, 'Read the documentation.');
    });
    await act(async () =>
      Array.from(dialog.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.createRole'))!
        .click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith({
      kind: 'create-role',
      name: 'Documentation',
      behavior: 'Read the documentation.',
    });
    expect(dialog.querySelector('[role=alert]')).not.toBeNull();
    expect(dialog.querySelector('textarea')!.value).toBe('Read the documentation.');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('ordinary role review selects one role without management powers and shows failed success notices truthfully', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  const role = {
    id: 'role-id',
    botSlug: 'ada',
    name: 'Colleague',
    behavior: 'Read public docs only.',
    capabilities: [],
    revision: 3,
  };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, purpose: 'conversation' }],
          roles: [role],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approveRole'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(host.querySelectorAll('.bh-pairing-detail input[type=checkbox]')).toHaveLength(0);
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = role.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      roleId: role.id,
      expectedRoleRevision: 3,
    });
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [
            {
              ...request,
              purpose: 'conversation',
              status: 'approved',
              roleId: role.id,
              revision: 2,
              notifications: [{ key: 'approved:2', attempts: 1, outcome: 'unconfirmed' }],
            },
          ],
          roles: [role],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
        .find((button) => button.textContent?.startsWith(zhTranslate('pairing.people')))!
        .click(),
    );
    expect(host.textContent).toContain(role.name);
    expect(host.textContent).toContain(zhTranslate('pairing.noticeUnconfirmed'));
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.revoke'),
    )!;
    await act(async () => revoke.click());
    expect(review).toHaveBeenLastCalledWith({
      kind: 'revoke',
      id: request.id,
      expectedRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('no capability is preselected; Web submits only explicit capabilities with the exact request revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approve'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>('.bh-pairing-detail input')).every(
        (input) => !input.checked,
      ),
    ).toBe(true);
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['approve'],
    });
    expect(host.textContent).toContain('ou_demo');
    expect(host.textContent).toContain('QA Lark');
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, revision: 2 }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>('.bh-pairing-detail input')).every(
        (input) => !input.checked,
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('approved authority lists only the granted capabilities and offers revocation with an exact revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, status: 'approved', revision: 2, capabilities: ['answer'] }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelectorAll('.bh-pairing-detail input')).toHaveLength(0);
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.revoke'),
    )!;
    await act(async () => revoke.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'revoke',
      id: request.id,
      expectedRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

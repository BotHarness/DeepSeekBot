// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type InputHTMLAttributes,
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
import { zhTranslate } from '../src/client/locale.js';
import type { PairingRequest } from '../../core/src/messaging/pairing.js';
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
it('role edits and reassignment submit explicit supported capabilities and current revisions', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(async () => {});
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
    await act(async () => button('pairing.editRole').click());
    const editor = host.querySelector('article fieldset')!;
    expect(editor.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
    await act(async () =>
      (editor.querySelector('input[type=checkbox]') as HTMLInputElement).click(),
    );
    await act(async () => button('pairing.saveRole').click());
    expect(change).toHaveBeenLastCalledWith({
      kind: 'edit-role',
      id: role.id,
      expectedRevision: 4,
      name: role.name,
      behavior: role.behavior,
      capabilities: ['approve'],
    });
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
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
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
    expect(Array.from(host.querySelectorAll('input')).every((input) => !input.checked)).toBe(true);
    await act(async () => host.querySelector('input')!.click());
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
    expect(Array.from(host.querySelectorAll('input')).every((input) => !input.checked)).toBe(true);
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
    expect(host.querySelectorAll('input')).toHaveLength(0);
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

// @vitest-environment jsdom
import { type PropsWithChildren } from 'react';
import { type ReactNode } from 'react';
import { type PairingRequest } from '../../core/src/messaging/pairing.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
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
import { zhTranslate } from '../src/client/locale.js';

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

it('deleting a role needs confirmation, and is blocked while someone holds or requests it', async () => {
  const role = {
    id: 'role-held',
    botSlug: 'ada',
    name: 'Reader',
    behavior: 'Read documentation.',
    capabilities: [],
    revision: 5,
  };
  const open = async (requests: PairingRequest[]) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host),
      change = vi.fn(async () => {});
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests,
          roles: [role],
          policy: { restricted: true, revision: 3, defaultRoleId: role.id },
          senderAccess: change,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
        .find((item) => item.textContent?.startsWith(zhTranslate('pairing.roles')))!
        .click(),
    );
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((item) => item.textContent === zhTranslate('pairing.deleteRole'))!
        .click(),
    );
    const dialog = host.querySelector('[role=dialog]')!;
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (item) => item.textContent === zhTranslate('pairing.deleteRole'),
    )!;
    return {
      dialog,
      confirm,
      change,
      close: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  };
  const held = await open([
    { ...request, status: 'approved', purpose: 'conversation', roleId: role.id },
  ]);
  try {
    expect(held.dialog.textContent).toContain(zhTranslate('pairing.deleteRoleInUse', { count: 1 }));
    expect(held.confirm.disabled).toBe(true);
    expect(held.change).not.toHaveBeenCalled();
  } finally {
    await held.close();
  }
  const spare = await open([]);
  try {
    expect(spare.dialog.textContent).toContain(zhTranslate('pairing.deleteDefaultRoleWarning'));
    await act(async () => spare.confirm.click());
    expect(spare.change).toHaveBeenCalledExactlyOnceWith({
      kind: 'delete-role',
      id: role.id,
      expectedRevision: 5,
    });
  } finally {
    await spare.close();
  }
});

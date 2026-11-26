// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';

vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'raised',
  Sheet: ({ label, children }: { label: string; children: ReactNode }) => (
    <section aria-label={label}>{children}</section>
  ),
  SheetFailed: ({ message, onRetry }: { message: string; onRetry(): void }) => (
    <button data-testid="message-person-retry" onClick={onRetry}>
      {message}
    </button>
  ),
}));
vi.mock('../src/ui/primitives/search-field', () => ({
  SearchField: ({ value, onChangeText }: { value: string; onChangeText(text: string): void }) => (
    <input
      data-testid="message-person-search"
      value={value}
      onChange={(event) => onChangeText(event.currentTarget.value)}
    />
  ),
}));
vi.mock('../src/ui/shell/account-avatar', () => ({ AccountAvatar: () => null }));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({
    testID,
    title,
    control,
    onPress,
  }: {
    testID?: string;
    title: string;
    control?: { kind: string };
    onPress?: () => void;
  }) => (
    <button
      data-testid={testID}
      data-busy={control?.kind === 'busy'}
      disabled={!onPress}
      onClick={onPress}
    >
      {title}
    </button>
  ),
}));
import { MessagePersonSheet } from '../src/ui/shell/message-person-sheet';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const people = [
  { humanId: 'bob', displayName: 'Bob' },
  { humanId: 'dave', displayName: 'Dave' },
];

function hostWith(answers: (method: string, args?: Record<string, unknown>) => unknown) {
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) =>
    answers(method, args),
  );
  return { client: { call } as unknown as HostClient, call };
}

async function render(client: HostClient | undefined, onOpened = vi.fn()) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(<MessagePersonSheet client={client} onClose={() => {}} onOpened={onOpened} />),
  );
  return { host, root, onOpened };
}

it('lists every person, filters by name and opens the picked DM', async () => {
  const { client, call } = hostWith((method) =>
    method === 'teamDirectory' ? people : { channel: { id: 'dm-humans-dave', name: 'Dave' } },
  );
  const { host, root, onOpened } = await render(client);
  expect(host.textContent).toContain('Bob');
  const search = host.querySelector<HTMLInputElement>('[data-testid="message-person-search"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(search, 'da');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-testid="message-person-bob"]')).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-dave"]')!.click(),
  );
  expect(call).toHaveBeenCalledWith('humanDm', { humanId: 'dave' });
  expect(onOpened).toHaveBeenCalledExactlyOnceWith({ channelId: 'dm-humans-dave', name: 'Dave' });
  act(() => root.unmount());
});

it('shows a retry when people cannot load and an error when the DM cannot open', async () => {
  let fail = true;
  const { client } = hostWith((method) => {
    if (method === 'teamDirectory') {
      if (fail) throw new Error('offline');
      return people;
    }
    throw new Error('member-not-found');
  });
  const { host, root, onOpened } = await render(client);
  expect(host.textContent).toContain(t.messagePerson.loadFailed);
  fail = false;
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-retry"]')!.click(),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-bob"]')!.click(),
  );
  expect(host.textContent).toContain(t.messagePerson.openFailed);
  expect(onOpened).not.toHaveBeenCalled();
  expect(
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-bob"]')!.disabled,
  ).toBe(false);
  act(() => root.unmount());
});

it('says when no one else is on the Host', async () => {
  const { client } = hostWith(() => []);
  const { host, root } = await render(client);
  expect(host.textContent).toContain(t.messagePerson.empty);
  expect(host.querySelector('[data-testid="message-person-search"]')).toBeNull();
  act(() => root.unmount());
});

it('ignores a DM that opens on a client the sheet no longer uses', async () => {
  let release: (value: unknown) => void = () => {};
  const old = hostWith((method) =>
    method === 'teamDirectory'
      ? people
      : new Promise((resolve) => {
          release = resolve;
        }),
  );
  const { host, root, onOpened } = await render(old.client);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-bob"]')!.click(),
  );
  const replacement = hostWith(() => people);
  await act(async () =>
    root.render(
      <MessagePersonSheet client={replacement.client} onClose={() => {}} onOpened={onOpened} />,
    ),
  );
  await act(async () => release({ channel: { id: 'dm-humans-bob', name: 'Bob' } }));
  expect(onOpened).not.toHaveBeenCalled();
  expect(
    host.querySelector<HTMLButtonElement>('[data-testid="message-person-bob"]')!.disabled,
  ).toBe(false);
  act(() => root.unmount());
});

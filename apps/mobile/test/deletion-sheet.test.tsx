// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('expo-router', () => ({ useRouter: () => ({ back() {} }) }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/chat/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'dialog' }, children),
}));

import type { DeletionClient, DeletionTarget } from '../src/host/deletion';
import { DeletionSheet } from '../src/ui/chat/deletion-sheet';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

const preview = {
  slug: 'ada',
  displayName: 'Ada',
  memoryDir: '/bots/ada',
  token: 'reviewed-scope',
  eraseAvailable: true,
  dependencies: { sessions: ['s1'], grants: [], identities: [], channels: ['dm1'], workspaces: [] },
};
const complete = {
  slug: 'ada',
  displayName: 'Ada',
  acceptedAt: '2026-10-25',
  memoryDir: '/bots/ada',
  eraseMemory: false,
  phase: 'complete',
  memory: 'retained',
};
async function setup(target: DeletionTarget = { kind: 'bot', id: 'ada', name: 'Ada' }) {
  const client = { call: vi.fn<DeletionClient['call']>(), refresh: vi.fn(async () => undefined) };
  client.call.mockResolvedValue({ preview });
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const element = (
    <DeletionSheet
      target={target}
      client={client}
      hostName="My computer"
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
  await act(async () => root?.render(element));
  const reopen = async () => {
    await act(async () => root?.render(null));
    await act(async () => root?.render(element));
  };
  return { client, onClose, onDeleted, reopen };
}
async function press(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}

it('reviews the Bot scope without deleting on cancellation', async () => {
  const { client, onClose, onDeleted } = await setup();
  expect(container.textContent).toContain('/bots/ada');
  await press(t.cancel);
  expect(onClose).toHaveBeenCalledOnce();
  expect(client.call).toHaveBeenCalledExactlyOnceWith('deletionPreview', { slug: 'ada' });
  expect(onDeleted).not.toHaveBeenCalled();
});

it('requires a fresh Memory choice after reopening and after a stale-scope refusal', async () => {
  const { client, reopen, onDeleted } = await setup();
  const toggle = () => {
    const input = container.querySelector<HTMLInputElement>('input[role="switch"]');
    if (!input) throw new Error('Memory choice is missing');
    return input;
  };
  expect(toggle().checked).toBe(false);
  await act(async () => toggle().click());
  expect(toggle().checked).toBe(true);
  await press(t.cancel);
  await reopen();
  expect(toggle().checked).toBe(false);
  await act(async () => toggle().click());
  client.call
    .mockRejectedValueOnce(new Error('stale-preview'))
    .mockResolvedValueOnce({ preview: { ...preview, token: 'new-scope' } });
  await press(t.deletion.deleteBot);
  expect(onDeleted).not.toHaveBeenCalled();
  expect(toggle().checked).toBe(false);
  client.call.mockResolvedValueOnce({ deletion: complete });
  await press(t.deletion.deleteBot);
  expect(client.call).toHaveBeenLastCalledWith('deletionConfirm', {
    slug: 'ada',
    token: 'new-scope',
    eraseMemory: false,
  });
});

it('sends explicit Memory erasure only when selected and blocks repeat confirmation', async () => {
  const { client, onDeleted } = await setup();
  await act(async () => container.querySelector<HTMLInputElement>('input[role="switch"]')?.click());
  let finish: ((value: unknown) => void) | undefined;
  client.call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await press(t.deletion.deleteBot);
  await press(t.deletion.deleteBot);
  expect(client.call).toHaveBeenCalledTimes(2);
  expect(client.call).toHaveBeenLastCalledWith('deletionConfirm', {
    slug: 'ada',
    token: 'reviewed-scope',
    eraseMemory: true,
  });
  await act(async () =>
    finish?.({ deletion: { ...complete, eraseMemory: true, memory: 'erased' } }),
  );
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('does not repeat a successful group dissolution when only list refresh failed', async () => {
  const { client, onDeleted } = await setup({ kind: 'group', id: 'g1', name: 'Launch' });
  client.call.mockResolvedValue({ deleted: true });
  client.refresh.mockRejectedValueOnce(new Error('offline'));
  await press(t.deletion.dissolve);
  expect(onDeleted).not.toHaveBeenCalled();
  await press(t.retry);
  expect(client.call).toHaveBeenCalledExactlyOnceWith('channelGroupDelete', { channelId: 'g1' });
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('removes a section only after confirmation and keeps a refusal open for retry', async () => {
  const { client, onDeleted } = await setup({ kind: 'section', id: 's1', name: 'Work' });
  expect(client.call).not.toHaveBeenCalled();
  expect(container.textContent).toContain(t.deletion.sectionBody);
  client.call.mockResolvedValueOnce({ removed: false });
  await press(t.deletion.deleteSection);
  expect(onDeleted).not.toHaveBeenCalled();
  client.call.mockResolvedValueOnce({ removed: true });
  await press(t.deletion.deleteSection);
  expect(client.call).toHaveBeenLastCalledWith('sectionRemove', { sectionId: 's1' });
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('retries list refresh after completed Bot deletion even if the new preview is offline', async () => {
  const { client, onDeleted } = await setup();
  client.call.mockResolvedValueOnce({ deletion: complete }).mockRejectedValue(new Error('offline'));
  client.refresh.mockRejectedValueOnce(new Error('offline'));
  await press(t.deletion.deleteBot);
  expect(onDeleted).not.toHaveBeenCalled();
  await press(t.retry);
  expect(client.call.mock.calls.filter(([method]) => method === 'deletionConfirm')).toHaveLength(1);
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('does not report incomplete deletion as success and retries its accepted scope', async () => {
  const { client, onDeleted } = await setup();
  client.call.mockResolvedValueOnce({ deletion: { ...complete, phase: 'incomplete' } });
  await press(t.deletion.deleteBot);
  expect(onDeleted).not.toHaveBeenCalled();
  expect(container.textContent).toContain(t.deletion.incomplete);
  client.call.mockResolvedValueOnce({ deletion: complete });
  await press(t.deletion.retry);
  expect(client.call).toHaveBeenLastCalledWith('deletionRetry', { slug: 'ada' });
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('confirms the reviewed scope with Memory retained by default and refreshes the list', async () => {
  const { client, onDeleted } = await setup();
  client.call.mockResolvedValue({ deletion: complete });
  await press(t.deletion.deleteBot);
  expect(client.call).toHaveBeenLastCalledWith('deletionConfirm', {
    slug: 'ada',
    token: 'reviewed-scope',
    eraseMemory: false,
  });
  expect(client.refresh).toHaveBeenCalledOnce();
  expect(onDeleted).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import { act, createElement, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';

const fixture = vi.hoisted(() => ({
  onState: undefined as undefined | ((state: string) => void),
  reads: [] as Array<(value: { status: string }) => void>,
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: (props: { children?: ReactNode; ref?: Ref<HTMLDivElement> }) =>
    createElement('div', { ref: props.ref }, props.children),
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, onState: (state: string) => void) => {
      fixture.onState = onState;
      return { remove: () => (fixture.onState = undefined) };
    },
  },
}));
vi.mock('../src/host/private-input', () => ({
  loadPrivateInput: vi.fn(
    () =>
      new Promise((resolve) => {
        fixture.reads.push((value) =>
          resolve({ account: 'Mail', purpose: 'Sign in', fields: [], ...value }),
        );
      }),
  ),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/text-field', () => ({ TextField: () => null }));
vi.mock('../src/ui/primitives/field-label', () => ({ labelInField: true }));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label }: { label: string }) => createElement('button', null, label),
}));
import { PrivateInputForm } from '../src/ui/private-input-form';

let root: Root;
let resource: ((resource: string | undefined) => void) | undefined;
const client = {
  secretInputAllowed: () => true,
  onResource: (listener: (resource: string | undefined) => void) => {
    resource = listener;
    return () => (resource = undefined);
  },
} as unknown as HostClient;
const target = { botSlug: 'mail', channelId: 'c1', messageId: 'm1' };

beforeEach(() => {
  vi.useFakeTimers();
  fixture.reads = [];
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
});

const settle = (index: number, status: string) =>
  act(async () => {
    fixture.reads[index]!({ status });
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

it('reads a pending request again on the Host notice instead of every 2.5 s', async () => {
  await act(async () => root.render(<PrivateInputForm client={client} target={target} />));
  await settle(0, 'pending');
  await advance(10_000);
  expect(fixture.reads).toHaveLength(1);
  await act(async () => {
    resource?.('devices');
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(fixture.reads).toHaveLength(1);
  await act(async () => {
    resource?.('private-inputs');
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(fixture.reads).toHaveLength(2);
  await settle(1, 'configured');
  await act(async () => {
    resource?.('private-inputs');
    fixture.onState?.('active');
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fixture.reads).toHaveLength(2);
});

it('reads again after a slow read when the Host announced a change during it', async () => {
  await act(async () => root.render(<PrivateInputForm client={client} target={target} />));
  await act(async () => {
    resource?.(undefined);
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(fixture.reads).toHaveLength(1);
  await settle(0, 'pending');
  expect(fixture.reads).toHaveLength(2);
});

it('reads again when the app returns to the foreground and as a slow safety net', async () => {
  await act(async () => root.render(<PrivateInputForm client={client} target={target} />));
  await settle(0, 'pending');
  await act(async () => {
    fixture.onState?.('active');
    await vi.advanceTimersByTimeAsync(30);
  });
  expect(fixture.reads).toHaveLength(2);
  await settle(1, 'pending');
  await advance(15_000);
  expect(fixture.reads).toHaveLength(3);
});

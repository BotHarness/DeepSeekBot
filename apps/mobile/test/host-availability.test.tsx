// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { ConnectionState } from '../src/host/client';
import { hostAvailabilitySource } from '../src/host/host-availability';
import { useVisibleSnapshot } from '../src/host/use-visible-snapshot';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps an editable form still on roster refreshes, while availability and pairing stay live', () => {
  let connection: ConnectionState = { status: 'connected', route: 'https://host.test' };
  let ids = ['a', 'b'];
  const snapshot = () => ids.map((hostId) => ({ saved: { hostId }, snapshot: { connection } }));
  let hosts = snapshot();
  const listeners = new Set<() => void>();
  const source = hostAvailabilitySource({
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => hosts,
  });
  const emit = () =>
    act(() => {
      hosts = snapshot();
      listeners.forEach((listener) => listener());
    });
  let renders = 0;
  function Form({ visible = true }: { visible?: boolean }) {
    const availability = useVisibleSnapshot(source, visible);
    renders++;
    return (
      <>
        <input defaultValue="unfinished tag" />
        <output>{JSON.stringify(availability)}</output>
      </>
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() => root.render(<Form />));
    const input = container.querySelector('input');
    const before = renders;
    emit();
    emit();
    expect(renders).toBe(before);
    connection = { status: 'connected', route: 'https://other-route.test' };
    emit();
    expect(renders).toBe(before);
    connection = {
      status: 'unreachable',
      route: 'https://host.test',
      attempt: 1,
      reason: 'offline',
    };
    emit();
    expect(container.textContent).toContain('offline');
    connection = { status: 'reconnecting', route: 'https://host.test', attempt: 1 };
    emit();
    expect(container.textContent).toContain('checking');
    connection = { status: 'connected', route: 'https://host.test' };
    emit();
    expect(container.textContent).toContain('online');
    ids = ['b', 'c'];
    emit();
    expect(container.textContent).not.toContain('"a"');
    expect(container.textContent).toContain('"c"');
    expect(container.querySelector('input')).toBe(input);
    expect(input?.value).toBe('unfinished tag');
    act(() => root.render(<Form visible={false} />));
    expect(listeners.size).toBe(0);
    connection = { status: 'stopped', route: '' };
    emit();
    act(() => root.render(<Form />));
    expect(container.textContent).toContain('offline');
  } finally {
    act(() => root.unmount());
  }
  expect(listeners.size).toBe(0);
});

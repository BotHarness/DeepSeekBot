// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useSelectionFeedback } from '../src/ui/selection-feedback';

vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Choices({ value, change }: { value: string; change(value: string): void }) {
  const select = useSelectionFeedback(value, change);
  return ['work', 'memory', 'settings'].map((target) => (
    <button key={target} onClick={() => select(target)}>
      {target}
    </button>
  ));
}

function render(element: ReactNode) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, dispose: () => act(() => root.unmount()) };
}

it('accepts the last tab request when a rapid sequence revisits an earlier pending target', () => {
  const change = vi.fn();
  const view = render(<Choices value="memory" change={change} />);
  try {
    const [work, , settings] = view.container.querySelectorAll('button');
    act(() => {
      work?.click();
      settings?.click();
      work?.click();
    });
    expect(change.mock.calls.map(([value]) => value)).toEqual(['work', 'settings', 'work']);
  } finally {
    view.dispose();
  }
});

it('can return to the current tab while a different destination is pending', () => {
  const change = vi.fn();
  const view = render(<Choices value="work" change={change} />);
  try {
    const [work, , settings] = view.container.querySelectorAll('button');
    act(() => {
      settings?.click();
      work?.click();
      work?.click();
    });
    expect(change.mock.calls.map(([value]) => value)).toEqual(['settings', 'work']);
  } finally {
    view.dispose();
  }
});

it('can cancel an older request after a newer asynchronous request fails', async () => {
  let select: ((target: string) => void) | undefined;
  let reject: ((failure: Error) => void) | undefined;
  const change = vi.fn((target: string) =>
    target === 'settings'
      ? new Promise<void>((_resolve, refuse) => {
          reject = refuse;
        })
      : new Promise<void>(() => {}),
  );
  function Probe() {
    select = useSelectionFeedback<string>('work', change);
    return null;
  }
  const view = render(<Probe />);
  try {
    act(() => {
      select?.('memory');
      select?.('settings');
    });
    await act(async () => reject?.(new Error('refused')));
    act(() => select?.('work'));
    expect(change.mock.calls.map(([value]) => value)).toEqual(['memory', 'settings', 'work']);
  } finally {
    view.dispose();
  }
});

it('can cancel an older request after a newer dispatch throws', () => {
  let select: ((target: string) => void) | undefined;
  const change = vi.fn((target: string) => {
    if (target === 'settings') throw new Error('refused');
    return new Promise<void>(() => {});
  });
  function Probe() {
    select = useSelectionFeedback<string>('work', change);
    return null;
  }
  const view = render(<Probe />);
  try {
    act(() => select?.('memory'));
    expect(() => act(() => select?.('settings'))).toThrow('refused');
    act(() => select?.('work'));
    expect(change.mock.calls.map(([value]) => value)).toEqual(['memory', 'settings', 'work']);
  } finally {
    view.dispose();
  }
});

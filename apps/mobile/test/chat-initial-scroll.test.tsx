// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { useChatInitialScroll } from '../src/ui/chat/chat-initial-scroll';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Scroll = ReturnType<typeof useChatInitialScroll>;

async function track(steps: ReadonlyArray<{ count: number; loaded?: boolean }>) {
  const seen: Scroll[] = [];
  function Probe({ count, loaded }: { count: number; loaded?: boolean }) {
    seen.push(useChatInitialScroll(true, count, loaded));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  for (const step of steps) await act(async () => root.render(<Probe {...step} />));
  act(() => root.unmount());
  return seen.at(-1)!;
}

it('keeps a loaded empty Session list mounted when its first row arrives', async () => {
  const first = await track([
    { count: 0, loaded: false },
    { count: 0, loaded: true },
  ]);
  const after = await track([
    { count: 0, loaded: false },
    { count: 0, loaded: true },
    { count: 1, loaded: true },
  ]);
  expect(after.key).toBe(first.key);
  expect(after).not.toHaveProperty('initialScrollIndex');
});

it('still opens a loaded Session with history at its latest row', async () => {
  const opened = await track([
    { count: 0, loaded: false },
    { count: 12, loaded: true },
  ]);
  expect(opened.key).toBe('rows');
  expect(opened).toMatchObject({ initialScrollIndex: 11 });
});

it('remounts a list that mounted before its rows loaded, as DM and Channel lists do', async () => {
  const before = await track([{ count: 0 }]);
  const after = await track([{ count: 0 }, { count: 30 }]);
  expect(before.key).toBe('list');
  expect(after.key).toBe('rows');
  expect(after).toMatchObject({ initialScrollIndex: 29 });
});

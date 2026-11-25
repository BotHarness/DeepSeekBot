// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HostClient } from '@botharness/host-client/client';
import { afterEach, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({
  transcript: vi.fn(),
  live: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
vi.mock('@botharness/host-client/session-detail', async (original) => ({
  ...(await original<typeof import('@botharness/host-client/session-detail')>()),
  sessionTranscript: reads.transcript,
  sessionLive: reads.live,
}));

import { useSessionTranscript } from '../src/ui/chat/use-session-transcript';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

const client = {} as HostClient;
const transcript = (text: string) => ({
  sessionId: 's1',
  seq: 1,
  running: false,
  items: [{ kind: 'user', id: 'u1', text }],
});

function Probe({ id }: { id: string }) {
  const view = useSessionTranscript(client, null, id, true);
  return (
    <p data-loaded={view.transcript !== undefined}>
      {view.items.map((item) => ('text' in item ? item.text : '')).join('|')}
    </p>
  );
}

async function mount(id: string) {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root!.render(<Probe id={id} />));
  return view;
}

it('opens a Session it has read before with the last transcript while it reloads', async () => {
  reads.transcript.mockResolvedValueOnce(transcript('First visit'));
  const first = await mount('s1');
  expect(first.textContent).toBe('First visit');
  act(() => root?.unmount());

  let answer: (value: unknown) => void = () => undefined;
  reads.transcript.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const again = await mount('s1');
  expect(again.querySelector('p')?.dataset['loaded']).toBe('true');
  expect(again.textContent).toBe('First visit');
  await act(async () => answer(transcript('Reloaded')));
  expect(again.textContent).toBe('Reloaded');

  act(() => root?.unmount());
  reads.transcript.mockImplementationOnce(() => new Promise(() => undefined));
  const other = await mount('s2');
  expect(other.querySelector('p')?.dataset['loaded']).toBe('false');
});

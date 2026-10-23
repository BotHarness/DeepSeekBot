// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RosterBot } from '../src/host/client';
import { useInviteSelection, type InviteSheetProps } from '../src/ui/chat/invite-selection';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
let draft: ReturnType<typeof useInviteSelection>;
function Harness(props: InviteSheetProps) {
  draft = useInviteSelection(props);
  return createElement('div', { ref: draft.mount });
}
const bot = (slug: string): RosterBot => ({
  slug,
  displayName: slug,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
});
const candidates = [bot('ada'), bot('bo'), bot('cy')];
async function render(props: InviteSheetProps) {
  if (root === undefined) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(createElement(Harness, props)));
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('invitation drawer draft', () => {
  it('selects and deselects locally, then invites every selected Bot only on confirm', async () => {
    const props = {
      candidates,
      onInvite: vi.fn(async (_entry: RosterBot) => undefined),
      onClose: vi.fn(),
    };
    await render(props);
    act(() => {
      draft.toggle('ada');
      draft.toggle('bo');
      draft.toggle('cy');
      draft.toggle('cy');
    });
    expect(props.onInvite).not.toHaveBeenCalled();
    expect(draft.canConfirm).toBe(true);
    await act(async () => draft.confirm());
    expect(props.onInvite.mock.calls.map(([entry]) => entry.slug)).toEqual(['ada', 'bo']);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('keeps failed and unsent selections, skipping prior successes on retry even with stale candidates', async () => {
    let failed = false;
    const props = {
      candidates,
      onInvite: vi.fn(async (entry: RosterBot) => {
        if (entry.slug === 'bo' && !failed) {
          failed = true;
          throw new Error('offline');
        }
      }),
      onClose: vi.fn(),
    };
    await render(props);
    act(() => {
      for (const entry of candidates) draft.toggle(entry.slug);
    });
    await act(async () => draft.confirm());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(draft.error).toContain('offline');
    expect([...draft.selected]).toEqual(['bo', 'cy']);
    expect(draft.eligible.map((entry) => entry.slug)).toEqual(['bo', 'cy']);
    await act(async () => draft.confirm());
    expect(props.onInvite.mock.calls.map(([entry]) => entry.slug)).toEqual([
      'ada',
      'bo',
      'bo',
      'cy',
    ]);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not send a second request or mutate selection while the current request is pending', async () => {
    const pending = deferred();
    const props = { candidates, onInvite: vi.fn(() => pending.promise), onClose: vi.fn() };
    await render(props);
    act(() => draft.toggle('ada'));
    let sending!: Promise<void>;
    act(() => {
      sending = draft.confirm();
      draft.toggle('bo');
      void draft.confirm();
    });
    expect(props.onInvite).toHaveBeenCalledOnce();
    expect([...draft.selected]).toEqual(['ada']);
    expect(draft.canConfirm).toBe(false);
    await act(async () => {
      pending.resolve();
      await sending;
    });
  });

  it('stops dispatching the remaining batch after dismissal while one request is pending', async () => {
    const pending = deferred();
    const props = { candidates, onInvite: vi.fn(() => pending.promise), onClose: vi.fn() };
    await render(props);
    act(() => {
      draft.toggle('ada');
      draft.toggle('bo');
    });
    let sending!: Promise<void>;
    act(() => {
      sending = draft.confirm();
    });
    act(() => root!.unmount());
    root = undefined;
    await act(async () => {
      pending.resolve();
      await sending;
    });
    expect(props.onInvite).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('does not send an invitation for a Bot no longer eligible after roster refresh', async () => {
    const props = {
      candidates,
      onInvite: vi.fn(async (_entry: RosterBot) => undefined),
      onClose: vi.fn(),
    };
    await render(props);
    act(() => {
      draft.toggle('ada');
      draft.toggle('bo');
    });
    await render({ ...props, candidates: [bot('bo')] });
    await act(async () => draft.confirm());
    expect(props.onInvite.mock.calls.map(([entry]) => entry.slug)).toEqual(['bo']);
  });
});

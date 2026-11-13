// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../src/host/conversation';
import { useMessageSourceState } from '../src/ui/chat/message-source-state';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const original: ConversationMessage = {
  id: 'source-id',
  at: '2026-11-13T00:00:00Z',
  author: 'human',
  body: '  original\n```text\nsource\n```',
  attachments: [],
  delivery: 'committed',
};

const purged: ConversationMessage = {
  ...original,
  body: '',
  source: {
    channelId: 'channel-a',
    revision: 2,
    message: {
      id: original.id,
      at: original.at,
      author: { kind: 'human' },
      body: '',
      contentPurge: { actor: 'local-human' },
    },
  },
};

function mount() {
  const root = createRoot(document.createElement('div'));
  let scope = 'host-a:channel-a';
  let focused = true;
  let messages: readonly ConversationMessage[] = [original];
  let current!: ReturnType<typeof useMessageSourceState>;
  const presented: string[] = [];
  function NativePresentation({ message }: { message: ConversationMessage }) {
    useLayoutEffect(() => {
      presented.push(message.body);
    }, [message]);
    return null;
  }
  function Probe() {
    current = useMessageSourceState(scope, focused, messages);
    return current.message === undefined ? null : <NativePresentation message={current.message} />;
  }
  const render = () => act(() => root.render(<Probe />));
  render();
  return {
    get current() {
      return current;
    },
    presented,
    scope(value: string) {
      scope = value;
      render();
    },
    focus(value: boolean) {
      focused = value;
      render();
    },
    messages(value: readonly ConversationMessage[]) {
      messages = value;
      render();
    },
    stop: () => act(() => root.unmount()),
  };
}

describe('retained message source presentation', () => {
  it('reads the current retained message rather than the message captured by the menu', () => {
    const view = mount();
    const updated = { ...original, body: 'current retained source' };
    view.messages([updated]);
    act(() => view.current.select(original));
    expect(view.current.message).toBe(updated);
    const latest = { ...updated, body: 'updated while the source page is open' };
    view.messages([latest]);
    expect(view.current.message).toBe(latest);
    act(() => view.current.close());
    expect(view.current.message).toBeUndefined();
    view.stop();
  });

  it('forgets a removed message even if the same ID appears again later', () => {
    const view = mount();
    act(() => view.current.select(original));
    view.messages([]);
    expect(view.current.message).toBeUndefined();
    view.messages([original]);
    expect(view.current.message).toBeUndefined();
    expect(view.presented).toEqual([original.body]);
    view.stop();
  });

  it('closes when cleanup retains a content-purge placeholder with the same ID', () => {
    const view = mount();
    act(() => view.current.select(original));
    view.messages([purged]);
    expect(view.current.message).toBeUndefined();
    view.messages([original]);
    expect(view.current.message).toBeUndefined();
    expect(view.presented).toEqual([original.body]);
    view.stop();
  });

  it('rejects a delayed sheet action after the message becomes a purge placeholder', () => {
    const view = mount();
    const deferred = view.current.select;
    view.messages([purged]);
    act(() => deferred(original));
    expect(view.current.message).toBeUndefined();
    expect(view.presented).toEqual([]);
    view.stop();
  });

  it.each(['scope', 'focus'] as const)(
    'ignores a delayed sheet action after the owner loses %s',
    (change) => {
      const view = mount();
      const deferred = view.current.select;
      if (change === 'scope') view.scope('host-b:channel-b');
      else view.focus(false);
      act(() => deferred(original));
      if (change === 'scope') view.scope('host-a:channel-a');
      else view.focus(true);
      expect(view.presented).toEqual([]);
      expect(view.current.message).toBeUndefined();
      view.stop();
    },
  );

  it('ignores a delayed action for a message that has already been removed', () => {
    const view = mount();
    const deferred = view.current.select;
    view.messages([]);
    act(() => deferred(original));
    view.messages([original]);
    expect(view.presented).toEqual([]);
    expect(view.current.message).toBeUndefined();
    view.stop();
  });

  it('closes on focus loss and stays closed when the chat regains focus', () => {
    const view = mount();
    act(() => view.current.select(original));
    view.focus(false);
    expect(view.current.message).toBeUndefined();
    view.focus(true);
    expect(view.current.message).toBeUndefined();
    expect(view.presented).toEqual([original.body]);
    view.stop();
  });
});

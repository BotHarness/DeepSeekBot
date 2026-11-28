// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { MESSAGE_LEAF, type ChannelSplit } from '../src/client/channel-split-layout.js';
import { ChannelWorkspace } from '../src/client/channel-workspace.js';
import {
  useTimelineScrolling,
  useTimelineScrollState,
} from '../src/client/features/channels/timeline-scroll.js';
import { createStore, type ChannelMessage } from '../src/client/store.js';
import { forgetTimelineScrolls } from '../src/client/timeline-position.js';
import { useTimelineWindow } from '../src/client/timeline-window.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  MarkdownText: () => null,
}));

const noop = () => undefined;

it('opens at the latest message when switching between split and unsplit Channel layouts', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const store = createStore();
  const actions = createActions(async () => {
    throw new Error('Switching the rendered timeline should not need a Host call');
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const scrollTop = new WeakMap<Element, number>();
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return this.isConnected ? 400 : 0;
  });
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return this.isConnected ? this.childElementCount * 40 : 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
    return scrollTop.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: Element,
    top: number,
  ) {
    scrollTop.set(this, Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight)));
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const viewport = this.parentElement;
    if (!this.hasAttribute('data-message-id') || viewport === null)
      return new DOMRect(0, 0, 400, 400);
    const index = Array.from(viewport.children).indexOf(this);
    return new DOMRect(0, index * 40 - viewport.scrollTop, 400, 40);
  });

  function Timeline({ channelId, messages }: { channelId: string; messages: ChannelMessage[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollState = useTimelineScrollState({
      scopeKey: channelId,
      store,
      companion: undefined,
    });
    const timelineWindow = useTimelineWindow([], new Set());
    const { timelineMount, onTimelineScroll } = useTimelineScrolling({
      scrollState,
      conversation: { ...store.getSnapshot().conversation, messages, status: 'ready' },
      scopeKey: channelId,
      channelId,
      scrollRef,
      timelineWindow,
      messages,
      unreadAfter: undefined,
      store,
      actions,
      loadOlderAtTop: noop,
      loadNewerAtBottom: noop,
      scheduleReadMark: noop,
    });
    return (
      <div ref={timelineMount} data-timeline={channelId} onScroll={onTimelineScroll}>
        {messages.map(({ id }) => (
          <div data-message-id={id} key={id} />
        ))}
      </div>
    );
  }

  const unsplit = { panel: MESSAGE_LEAF };
  const split: ChannelSplit = {
    axis: 'horizontal',
    ratio: 0.7,
    first: unsplit,
    second: { panel: 'sessions' },
  };
  async function open(channelId: string, count: number, tree: ChannelSplit) {
    const messages: ChannelMessage[] = Array.from({ length: count }, (_, index) => ({
      id: `${channelId}-${index}`,
      at: '',
      body: `Message ${index}`,
      author: { kind: 'human' },
    }));
    await act(async () => {
      root.render(
        <ChannelWorkspace
          channelId={channelId}
          tree={tree}
          setTree={noop}
          panels={{
            [MESSAGE_LEAF]: {
              label: 'Messages',
              content: <Timeline {...{ channelId, messages }} />,
            },
            sessions: { label: 'Sessions', content: null },
          }}
        />,
      );
    });
    const viewport = container.querySelector<HTMLDivElement>(`[data-timeline="${channelId}"]`);
    if (viewport === null) throw new Error(`Timeline for ${channelId} did not open`);
    return viewport;
  }

  try {
    const positions = [
      (await open('short-channel', 28, unsplit)).scrollTop,
      (await open('long-channel', 220, split)).scrollTop,
      (await open('short-channel', 28, unsplit)).scrollTop,
    ];
    expect(positions).toEqual([720, 8400, 720]);

    const reading = await open('long-channel', 220, split);
    await act(async () => {
      reading.scrollTop = 5230;
      reading.dispatchEvent(new Event('scroll'));
    });
    await open('short-channel', 28, unsplit);
    expect((await open('long-channel', 220, split)).scrollTop).toBe(5230);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    forgetTimelineScrolls();
    vi.restoreAllMocks();
  }
});

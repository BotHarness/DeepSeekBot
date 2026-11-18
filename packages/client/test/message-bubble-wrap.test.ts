// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: stub,

    MarkdownText: stub,

    SegmentedControl: stub,
    StateDot: stub,
    Tag,

    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { MessageBubbleWrap } from '../src/client/bot-main.js';
import type { ChannelMessage } from '../src/client/store.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const baseMessage: ChannelMessage = {
  id: 'm1',
  at: '2026-10-10T00:00:00.000Z',
  author: { kind: 'human' },
  body: 'hello',
};

type MenuCall = { message: ChannelMessage; x: number; y: number };

async function renderWrap(
  onContextMenu: (message: ChannelMessage, x: number, y: number) => void,
  message: ChannelMessage = baseMessage,
  focused = false,
): Promise<HTMLElement> {
  await act(async () => {
    root.render(createElement(MessageBubbleWrap, { message, focused, onContextMenu }, 'hello'));
  });
  const node = host.querySelector<HTMLElement>('[data-message-id="m1"]');
  if (node === null) throw new Error('bubble wrap did not render');
  return node;
}

function touchEvent(type: string, touches: { clientX: number; clientY: number }[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  (event as unknown as { touches: unknown }).touches = touches;
  return event;
}

describe('MessageBubbleWrap long-press', () => {
  it('opens the menu after a 500ms press without moving', async () => {
    vi.useFakeTimers();
    const calls: MenuCall[] = [];
    const node = await renderWrap((message, x, y) => calls.push({ message, x, y }));
    await act(async () => {
      node.dispatchEvent(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
    });
    expect(calls).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.message.id).toBe('m1');
    expect(calls[0]?.x).toBe(100);
    expect(calls[0]?.y).toBe(200);
  });

  it('cancels the menu when the finger moves before the timeout', async () => {
    vi.useFakeTimers();
    const calls: MenuCall[] = [];
    const node = await renderWrap((message, x, y) => calls.push({ message, x, y }));
    await act(async () => {
      node.dispatchEvent(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
      node.dispatchEvent(touchEvent('touchmove', [{ clientX: 130, clientY: 200 }]));
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(calls).toHaveLength(0);
  });

  it('cancels the menu on early lift', async () => {
    vi.useFakeTimers();
    const calls: MenuCall[] = [];
    const node = await renderWrap((message, x, y) => calls.push({ message, x, y }));
    await act(async () => {
      node.dispatchEvent(touchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
      node.dispatchEvent(touchEvent('touchend', []));
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(calls).toHaveLength(0);
  });

  it('ignores multi-touch presses', async () => {
    vi.useFakeTimers();
    const calls: MenuCall[] = [];
    const node = await renderWrap((message, x, y) => calls.push({ message, x, y }));
    await act(async () => {
      node.dispatchEvent(
        touchEvent('touchstart', [
          { clientX: 100, clientY: 200 },
          { clientX: 120, clientY: 220 },
        ]),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(calls).toHaveLength(0);
  });

  it('keeps the right-click context menu working', async () => {
    const calls: MenuCall[] = [];
    const node = await renderWrap((message, x, y) => calls.push({ message, x, y }));
    await act(async () => {
      node.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 30,
          clientY: 40,
        }),
      );
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.x).toBe(30);
    expect(calls[0]?.y).toBe(40);
  });

  it('keeps the focused and failed bubble states on the wrap', async () => {
    const failed: ChannelMessage = { ...baseMessage, failed: 'network disconnected' };
    const node = await renderWrap(() => undefined, failed, true);
    expect(node.className).toContain('bh-bubble-focused');
    expect(node.className).toContain('bh-bubble-wrap-failed');
  });
});

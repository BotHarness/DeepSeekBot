// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PanEvent = { translationX: number };
type Pan = {
  enabled: boolean;
  activeX: unknown;
  start(): void;
  update(event: PanEvent): void;
  end(event: PanEvent): void;
  finalize(): void;
};

const state = vi.hoisted(() => ({ pans: [] as Pan[], haptics: [] as string[] }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('../src/ui/haptics', () => ({ haptic: (moment: string) => state.haptics.push(moment) }));
vi.mock('react-native-gesture-handler', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    Gesture: {
      Pan: () => {
        const pan: Pan = {
          enabled: true,
          activeX: undefined,
          start: () => undefined,
          update: () => undefined,
          end: () => undefined,
          finalize: () => undefined,
        };
        state.pans.push(pan);
        const builder = {
          enabled: (value: boolean) => ((pan.enabled = value), builder),
          activeOffsetX: (value: unknown) => ((pan.activeX = value), builder),
          failOffsetY: () => builder,
          onStart: (run: Pan['start']) => ((pan.start = run), builder),
          onUpdate: (run: Pan['update']) => ((pan.update = run), builder),
          onEnd: (run: Pan['end']) => ((pan.end = run), builder),
          onFinalize: (run: Pan['finalize']) => ((pan.finalize = run), builder),
        };
        return builder;
      },
    },
    GestureDetector: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children as never),
  };
});

const { ReplySwipe } = await import('../src/ui/chat/reply-swipe');
const { ReplyBar } = await import('../src/ui/chat/reply-bar');
const { replyTravel, repliesAt } = await import('../src/ui/chat/reply-swipe-model');
const { swipeReply } = await import('../src/ui/design/tokens');
const { t } = await import('../src/ui/strings');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('swipe right to reply', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.pans.length = 0;
    state.haptics.length = 0;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('follows the finger up to its reach, then resists, and commits past the threshold', () => {
    expect(replyTravel(-40)).toBe(0);
    expect(replyTravel(30)).toBe(30);
    expect(replyTravel(swipeReply.reach)).toBe(swipeReply.reach);
    expect(replyTravel(swipeReply.reach + 40)).toBe(swipeReply.reach + 10);
    expect(repliesAt(swipeReply.commit - 1)).toBe(false);
    expect(repliesAt(swipeReply.commit)).toBe(true);
  });

  it('starts only rightward, ticks once at the threshold and replies on release', async () => {
    const onReply = vi.fn();
    await act(async () =>
      root.render(
        <ReplySwipe enabled onReply={onReply}>
          <span>bubble</span>
        </ReplySwipe>,
      ),
    );
    const pan = state.pans.at(-1)!;
    expect(pan.activeX).toBe(swipeReply.start);
    expect(container.textContent).toContain('bubble');
    pan.start();
    pan.update({ translationX: swipeReply.commit / 2 });
    expect(state.haptics).toEqual([]);
    pan.update({ translationX: swipeReply.commit });
    pan.update({ translationX: swipeReply.commit + 20 });
    expect(state.haptics).toEqual(['selection']);
    pan.end({ translationX: swipeReply.commit + 20 });
    pan.finalize();
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it('does nothing when let go before the threshold or when off', async () => {
    const onReply = vi.fn();
    await act(async () =>
      root.render(
        <ReplySwipe enabled={false} onReply={onReply}>
          <span>bubble</span>
        </ReplySwipe>,
      ),
    );
    const pan = state.pans.at(-1)!;
    expect(pan.enabled).toBe(false);
    pan.start();
    pan.update({ translationX: swipeReply.commit - 10 });
    pan.end({ translationX: swipeReply.commit - 10 });
    expect(onReply).not.toHaveBeenCalled();
  });

  it('shows who is being replied to above the composer, with a way out', async () => {
    const onCancel = vi.fn();
    await act(async () =>
      root.render(
        <ReplyBar
          message={{
            id: 'bot-1',
            at: '2026-10-28T00:00:00.000Z',
            author: 'bot',
            bot: 'ada',
            body: 'Pick a file',
            attachments: [],
            delivery: 'committed',
          }}
          botName={(id) => (id === 'ada' ? 'Ada' : id)}
          onCancel={onCancel}
        />,
      ),
    );
    expect(container.textContent).toContain(t.reply.to('Ada'));
    expect(container.textContent).toContain('Pick a file');
    const cancel = container.querySelector(`[aria-label="${t.reply.cancel}"]`) as HTMLElement;
    await act(async () => cancel.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

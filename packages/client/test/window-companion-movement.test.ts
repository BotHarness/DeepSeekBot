// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { CompanionSound } from '../src/client/companion-sound.js';
import { companionPosition } from './companion-position.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

it('keeps the bubble tail on the Avatar head through resize and the first reduced-motion release commit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let stage = new DOMRect(80, 40, 800, 600);
  const measurement = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('bh-persona-avatar')) return stage;
      const surface = this.closest<HTMLElement>('.bh-companion')!;
      return new DOMRect(
        stage.left + Number.parseFloat(companionPosition(surface).left),
        stage.bottom - Number.parseFloat(companionPosition(surface).bottom) - 96,
        96,
        96,
      );
    });
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  companion.configure({ walking: false });
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false, avatar: '/image' },
        activity: { generation: 'host', revision: 0, bots: [] },
      }),
    }),
  );
  events.dispatchEvent(
    new MessageEvent('companion/message', {
      data: JSON.stringify({
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'tether',
        body: 'Still here.',
        source: 'own-dm',
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const tailX = () => {
    const bubble = node.querySelector<HTMLElement>('.bh-companion-bubble')!;
    return (
      Number.parseFloat(companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).left) +
      Number.parseFloat(bubble.style.left) +
      Number.parseFloat(bubble.style.getPropertyValue('--bh-companion-tail'))
    );
  };
  const frame = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(performance.now() + 50);
  };
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    await act(frame);
    expect(tailX()).toBe(570);
    expect(node.querySelector('.bh-companion-tether')).toBeNull();
    expect(node.querySelector<HTMLElement>('.bh-companion-bubble')?.style.bottom).toBe('112px');
    stage = new DOMRect(100, 60, 650, 500);
    await act(() => window.dispatchEvent(new Event('resize')));
    await act(frame);
    expect(tailX()).toBe(570);
    stage = new DOMRect(100, 60, 320, 500);
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).left).toBe('216px');
    expect(tailX()).toBe(264);
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    const character = node.querySelector<HTMLButtonElement>('.bh-companion-character')!;
    character.setPointerCapture = vi.fn();
    character.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      character.dispatchEvent(event);
    };
    await act(() => pointer('pointerdown', 264, 450));
    await act(() => pointer('pointermove', 164, 150));
    await act(frame);
    expect(companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).bottom).toBe(
      '300px',
    );
    expect(tailX()).toBe(164);
    await act(() => pointer('pointerup', 164, 150));
    expect(companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).bottom).toBe('0px');
    expect(tailX()).toBe(164);
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
    visibility.mockRestore();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['botharnessMotion'];
  }
});

it('turns the Avatar toward its walk and faces front without walking while it speaks', async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const measurement = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 800, 600));
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  companion.configure({ walking: true, position: 0.5 });
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  let now = performance.now();
  const frame = () => {
    now += 50;
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(now);
  };
  const facing = () =>
    node.querySelector<HTMLElement>('.bh-companion-character')?.dataset['facing'];
  const left = () => companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).left;
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    await act(frame);
    await act(frame);
    expect(facing()).toBe('right');
    events.dispatchEvent(
      new MessageEvent('companion/message', {
        data: JSON.stringify({
          generation: 'host',
          botId: 'ada',
          channelId: 'dm',
          channelName: 'Ada',
          messageId: 'hello',
          body: 'Hello there.',
          source: 'own-dm',
        }),
      }),
    );
    await act(frame);
    expect(facing()).toBe('front');
    const standing = left();
    await act(frame);
    await act(frame);
    expect(left()).toBe(standing);
    await act(() => companion.dismiss('hello', 'dm'));
    await act(frame);
    await act(frame);
    expect(facing()).toBe('right');
    expect(left()).not.toBe(standing);
    await act(() => companion.configure({ walking: false }));
    await act(frame);
    expect(facing()).toBe('saved');
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
  }
});

it.each([
  [100, 0, false],
  [200, 0, false],
  [500, 0, false],
  [16, 1000, false],
  [16, 0, true],
])(
  'returns a fast upward throw with %i ms frames, %i ms before release and late movement %s',
  async (interval, beforeRelease, lateMovement) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const measurement = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 1000, 800));
    const events = new EventTarget();
    const companion = new WindowCompanion({
      context: async () => ({ profileId: 'qa' }),
      source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
    });
    await companion.start();
    companion.select('ada');
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          bot: { slug: 'ada', name: 'Ada', paused: false },
          activity: { generation: 'host', revision: 0, bots: [] },
        }),
      }),
    );
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const openDm = vi.fn();
    try {
      await act(() =>
        root.render(
          createElement(WindowCompanionView, {
            companion,
            openDm,
            openAttention() {},
            openChannel() {},
            t: zhTranslate,
          }),
        ),
      );
      const character = node.querySelector('.bh-companion-character');
      const surface = node.querySelector('.bh-companion');
      if (!(character instanceof HTMLButtonElement) || !(surface instanceof HTMLElement))
        throw new Error('Missing companion controls');
      character.setPointerCapture = vi.fn();
      character.releasePointerCapture = vi.fn();
      const pointer = (type: string, y: number) => {
        const event = new MouseEvent(type, { bubbles: true, clientX: 700, clientY: y, button: 0 });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        character.dispatchEvent(event);
      };
      await act(() => pointer('pointerdown', 750));
      await act(() => {
        vi.advanceTimersByTime(beforeRelease);
        vi.advanceTimersByTime(16);
        pointer('pointermove', 550);
      });
      await act(() => {
        vi.advanceTimersByTime(16);
        pointer('pointermove', 300);
        pointer('pointerup', 300);
        if (lateMovement) {
          pointer('lostpointercapture', 300);
          pointer('pointermove', 290);
          character.click();
        }
      });
      expect(surface.dataset['motion']).toBe('fall');
      const releasedBottom = Number.parseFloat(companionPosition(surface).bottom);
      const heights: number[] = [];
      for (let index = 0; index < 3000 / interval; index++) {
        await act(() => {
          vi.advanceTimersByTime(interval);
          const due = [...frames.values()];
          frames.clear();
          due.forEach((callback) => callback(performance.now()));
        });
        heights.push(Number.parseFloat(companionPosition(surface).bottom));
      }
      expect(heights.some((height) => height > releasedBottom)).toBe(true);
      expect(heights.slice(0, 2000 / interval).some((height) => height === 0)).toBe(true);
      expect(surface.dataset['motion']).toBe('rest');
      expect(companionPosition(surface).bottom).toBe('0px');
      expect(openDm).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      companion.dispose();
      node.remove();
      measurement.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);

it('drags inside the shell, lands on the floor without opening DM, persists keyboard movement and releases frames', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++frameId;
    frames.set(id, (time) => {
      frames.delete(id);
      callback(time);
    });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let intersect: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | undefined;
  const disconnected = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private readonly callback: (
          entries: { target: Element; isIntersecting: boolean }[],
        ) => void,
      ) {}
      observe(target: Element) {
        if (target.matches('.bh-companion-stage')) intersect = this.callback;
      }
      disconnect() {
        if (this.callback === intersect) disconnected();
      }
    },
  );
  const measurement = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON: () => ({}),
  });
  const events = new EventTarget();
  const close = vi.fn();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close }),
  });
  await owner.start();
  owner.select('ada');
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const openDm = vi.fn();
  const sound = new CompanionSound();
  const stop = vi.spyOn(sound, 'stop');
  const interact = vi.spyOn(sound, 'interact');
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion: owner,
          sound,
          openDm,
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    const character = node.querySelector('.bh-companion-character');
    const surface = node.querySelector('.bh-companion');
    const stage = node.querySelector('.bh-companion-stage');
    if (
      !(character instanceof HTMLButtonElement) ||
      !(surface instanceof HTMLElement) ||
      !(stage instanceof HTMLElement)
    )
      throw new Error('Missing companion controls');
    expect(node.querySelector('.bh-companion-activity')).toBeNull();
    await act(() => character.focus());
    expect(owner.getSnapshot().reading).toBe(true);
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      ),
    );
    expect(node.querySelector('[aria-expanded="true"]')).not.toBeNull();
    await act(() =>
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(node.querySelector('[aria-expanded="true"]')).toBeNull();
    expect(document.activeElement).toBe(character);
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now());
    });
    await act(() => intersect!([{ target: stage, isIntersecting: false }]));
    for (let tick = 0; tick < 2; tick++)
      await act(() => {
        for (const callback of [...frames.values()]) callback(performance.now());
      });
    expect(frames.size).toBe(0);
    await act(() => intersect!([{ target: stage, isIntersecting: true }]));
    expect(frames.size).toBe(1);
    const visibility = vi.spyOn(document, 'hidden', 'get');
    visibility.mockReturnValue(true);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
    visibility.mockReturnValue(false);
    await act(() => {
      vi.advanceTimersByTime(30_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(1);
    visibility.mockRestore();
    character.setPointerCapture = vi.fn();
    character.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number, id = 1) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: id });
      character.dispatchEvent(event);
    };
    const advanceFrames = async (count: number) => {
      for (let index = 0; index < count; index++) {
        await act(() => {
          vi.advanceTimersByTime(16);
          const callbacks = [...frames.values()];
          frames.clear();
          for (const callback of callbacks) callback(performance.now());
        });
      }
    };
    await act(() => pointer('pointerdown', 700, 750));
    await act(() => pointer('pointermove', 702, 750));
    expect(interact).not.toHaveBeenCalled();
    await act(() => pointer('pointermove', 400, 400));
    expect(interact).toHaveBeenLastCalledWith('ada', { kind: 'grab', strength: 1 });
    await advanceFrames(2);
    expect(Number.parseFloat(character.style.rotate)).toBeLessThan(0);
    const beforeReversal = character.style.rotate;
    await act(() => pointer('pointermove', 450, 400));
    expect(character.style.rotate).toBe(beforeReversal);
    for (let index = 0; index < 12; index++) {
      await act(() => pointer('pointermove', 450 + index * 5, 400));
      await advanceFrames(1);
    }
    expect(Number.parseFloat(character.style.rotate)).toBeGreaterThan(0);
    await act(() => pointer('pointermove', 400, 400));
    const lifted = Number.parseFloat(companionPosition(surface).bottom);
    expect(lifted).toBeGreaterThan(12);
    const draggedLeft = companionPosition(surface).left;
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(Number.parseFloat(companionPosition(surface).bottom)).toBe(lifted);
    await act(() => pointer('pointermove', 400, 400));
    expect(companionPosition(surface).left).toBe(draggedLeft);
    await act(() => {
      pointer('pointerdown', 400, 400, 2);
      pointer('pointermove', 800, 100, 2);
      pointer('pointercancel', 800, 100, 2);
      pointer('lostpointercapture', 800, 100, 2);
    });
    expect(companionPosition(surface).left).toBe(draggedLeft);
    expect(surface.dataset['motion']).toBe('drag');
    await act(() => {
      pointer('pointerup', 400, 400);
    });
    await act(() => vi.advanceTimersByTimeAsync(50));
    await act(() => {
      character.click();
    });
    expect(Number.parseFloat(companionPosition(surface).bottom)).toBe(lifted);
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(Number.parseFloat(companionPosition(surface).bottom)).toBe(lifted);
    expect(surface.dataset['motion']).toBe('fall');
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    expect(companionPosition(surface).bottom).toBe('0px');
    expect(character.style.rotate).toBe('0deg');
    expect(character.style.transform).toBe('scale(1, 1)');
    await act(() => {
      delete document.documentElement.dataset['botharnessMotion'];
    });
    interact.mockClear();
    await act(() => {
      pointer('pointerdown', 400, 750);
      pointer('pointermove', 400, 750 - lifted);
      pointer('pointerup', 400, 750 - lifted);
    });

    expect(openDm).not.toHaveBeenCalled();
    const positions: number[] = [];
    await act(() => owner.reading(true));
    for (let index = 0; index < 240; index += 1) {
      await act(() => {
        vi.advanceTimersByTime(16);
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(performance.now());
      });
      positions.push(Number.parseFloat(companionPosition(surface).bottom));
    }
    expect(positions.some((bottom) => bottom > 0 && bottom < lifted)).toBe(true);
    expect(positions.every((bottom) => bottom >= 0 && bottom <= window.innerHeight - 120)).toBe(
      true,
    );
    const firstContact = positions.findIndex((bottom) => bottom === 0);
    expect(firstContact).toBeGreaterThan(0);
    expect(positions.slice(firstContact + 1).some((bottom) => bottom > 0)).toBe(true);
    expect(companionPosition(surface).bottom).toBe('0px');
    expect(openDm).not.toHaveBeenCalled();
    expect(interact.mock.calls.filter(([, event]) => event.kind === 'land')).toHaveLength(1);
    await act(() => owner.reading(false));
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            channelId: 'dm',
            channelName: 'Ada',
            messageId: 'offscreen-playback',
            body: 'Keep this text paused while the thrown character is outside the visible area.',
            source: 'own-dm',
          }),
        }),
      ),
    );
    await act(() => owner.reading(true));
    for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      await act(() => {
        pointer('pointerdown', 400, 750);
        pointer('pointermove', 450, -50);
        pointer(release, 450, -50);
      });
      await advanceFrames(1);
      await act(() => intersect!([{ target: surface, isIntersecting: false }]));
      expect(stop).toHaveBeenLastCalledWith('ada');
      interact.mockClear();
      const shown = owner.getSnapshot().cards[0]!.shown;
      expect(Number.isFinite(Number.parseFloat(companionPosition(surface).bottom))).toBe(true);
      await advanceFrames(240);
      expect(surface.dataset['motion']).toBe('rest');
      expect(companionPosition(surface).bottom).toBe('0px');
      expect(owner.getSnapshot().cards[0]!.shown).toBe(shown);
      expect(interact).not.toHaveBeenCalled();
    }
    await act(() => intersect!([{ target: surface, isIntersecting: true }]));
    await act(() =>
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(owner.getSnapshot().selection?.position).toBeCloseTo(
      Number.parseFloat(companionPosition(surface).left) / 896,
    );
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    await act(() => {
      pointer('pointerdown', 400, 750);
      pointer('pointermove', 700, 200);
    });
    expect(character.style.rotate).toBe('0deg');
    expect(character.style.transform).toBe('scale(1, 1)');
    await act(() => pointer('pointerup', 700, 200));
    expect(companionPosition(surface).bottom).toBe('0px');
    await act(() => vi.runOnlyPendingTimers());
    delete document.documentElement.dataset['botharnessMotion'];
    await act(() => {
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      character.click();
    });
    expect(openDm).toHaveBeenCalledExactlyOnceWith('ada');
    await act(() => {
      owner.configure({ activity: false });
      events.dispatchEvent(new Event('error'));
    });
    expect(surface.dataset['sync']).toBe('stale');
    expect(character.title).toContain('同步中断');
    expect(frames.size).toBeGreaterThan(0);
    const focusVisible = vi.spyOn(character, 'matches').mockReturnValue(false);
    await act(() =>
      character.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
      ),
    );
    await act(() => vi.advanceTimersByTime(800));
    expect(document.activeElement).toBe(character);
    expect(owner.getSnapshot().reading).toBe(false);
    focusVisible.mockRestore();
    await act(() => root.unmount());
    expect(frames.size).toBe(0);
    expect(disconnected).toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    owner.dispose();
    expect(close).toHaveBeenCalledOnce();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['botharnessMotion'];
    vi.useRealTimers();
  }
});

it('keeps the avatar above the composer status and follows its disappearing inset', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.documentElement.dataset['botharnessMotion'] = 'reduce';
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  let now = performance.now();
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const obstacle = document.createElement('div');
  obstacle.setAttribute('data-companion-avoid', '');
  obstacle.style.setProperty('--bh-companion-avoid-inset', '34px');
  document.body.append(obstacle);
  const stage = new DOMRect(0, 0, 375, 667);
  const measurement = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      return this === obstacle ? new DOMRect(8, 559, 359, 92) : stage;
    });
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'status-clearance' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  companion.configure({ walking: false });
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'status-clearance',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const frame = () => {
    now += 300;
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(now);
  };
  const bottom = () =>
    Number.parseFloat(companionPosition(node.querySelector<HTMLElement>('.bh-companion')!).bottom);
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    await act(frame);
    expect(bottom()).toBe(146);
    obstacle.style.setProperty('--bh-companion-avoid-inset', '0px');
    await act(frame);
    expect(bottom()).toBe(112);
    obstacle.remove();
    await act(frame);
    expect(bottom()).toBe(0);
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    obstacle.remove();
    measurement.mockRestore();
    clock.mockRestore();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['botharnessMotion'];
  }
});

// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { WINDOW_COMPANION_CSS } from '../src/client/window-companion-styles.js';
import { zhTranslate } from '../src/client/locale.js';
import { CompanionSound } from '../src/client/companion-sound.js';
import { companionPosition } from './companion-position.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: ({
    anchor,
    open,
    items,
    onSelect,
  }: {
    anchor: ReactNode;
    open: boolean;
    items: { id: string; label?: string; disabled?: boolean }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      {},
      anchor,
      open
        ? items
            .filter((item) => item.label)
            .map((item) =>
              createElement(
                'button',
                { key: item.id, disabled: item.disabled, onClick: () => onSelect(item.id) },
                item.label,
              ),
            )
        : null,
    ),
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
}));

it('speaks one sentence beat at a time and follows the whole message while reading', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  const send = (type: string, value: unknown) =>
    events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
  await companion.start();
  companion.select('ada');
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host', revision: 0, bots: [] },
  });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  let messageHeight = 0;
  const height = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.matches('.bh-companion-bubble p') ? messageHeight : 0;
    });
  const viewport = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(54);
  const text = () => node.querySelector('.bh-companion-bubble p')?.textContent;
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
    await act(() => {
      send('companion/message', {
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'long',
        body: 'First sentence here. Second one follows! ' + 'C'.repeat(150),
        source: 'own-dm',
      });
      send('companion/message', {
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'queued',
        body: 'Queued reply.',
        source: 'own-dm',
      });
      companion.advance(350);
    });
    expect(node.querySelectorAll('.bh-companion-bubble')).toHaveLength(1);
    expect(node.querySelector('.bh-companion-queue')?.textContent).toBe('+1');
    expect(text()).toBe('First sent');
    await act(() => companion.advance(350));
    expect(text()).toBe('First sentence here.');
    await act(() => companion.advance(1000));
    expect(text()).toBe('First sentence here.');
    await act(() => companion.advance(500));
    await act(() => companion.advance(70));
    expect(text()).toBe('S');
    messageHeight = 180;
    await act(() => companion.reading(true));
    const paragraph = node.querySelector<HTMLParagraphElement>('.bh-companion-bubble p')!;
    expect(paragraph.textContent).toBe('First sentence here. S');
    expect(paragraph.scrollTop).toBe(126);
    await act(() => {
      paragraph.scrollTop = 18;
      paragraph.dispatchEvent(new Event('scroll'));
    });
    messageHeight = 216;
    await act(() => companion.advance(350));
    expect(paragraph.scrollTop).toBe(18);
    expect(paragraph.textContent).toBe('First sentence here. Second one ');
    await act(() => {
      paragraph.scrollTop = 162;
      paragraph.dispatchEvent(new Event('scroll'));
    });
    messageHeight = 252;
    await act(() => companion.advance(350));
    expect(paragraph.scrollTop).toBe(198);
    await act(() => companion.reading(false));
    expect(text()).toBe('Second one follows!');
    expect(node.querySelector('.bh-companion-bubble p')).toBe(paragraph);
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    height.mockRestore();
    viewport.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('measures every revealed tail before scrolling any of them in one commit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const owners = await Promise.all(
    ['ada', 'grace', 'linus'].map(async (slug) => {
      const events = new EventTarget();
      const companion = new WindowCompanion({
        context: async () => ({ profileId: 'qa' }),
        source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
      });
      const send = (type: string, value: unknown) =>
        events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
      await companion.start();
      companion.select(slug);
      send('companion/baseline', {
        profileId: 'qa',
        bot: { slug, name: slug, paused: false },
        activity: { generation: 'host', revision: 0, bots: [] },
      });
      send('companion/message', {
        generation: 'host',
        botId: slug,
        channelId: 'dm',
        channelName: slug,
        messageId: slug,
        body: 'x'.repeat(200),
        source: 'own-dm',
      });
      companion.reading(true);
      return companion;
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const order: string[] = [];
  const height = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.matches('.bh-companion-bubble p')) return 0;
      order.push('measure');
      return 180;
    });
  const viewport = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(54);
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches('.bh-companion-bubble p')) order.push('scroll');
  });
  try {
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          ...owners.map((companion, index) =>
            createElement(WindowCompanionView, {
              key: index,
              companion,
              openDm() {},
              openAttention() {},
              openChannel() {},
              t: zhTranslate,
            }),
          ),
        ),
      ),
    );
    await act(() => owners.forEach((companion) => companion.advance(350)));
    order.length = 0;
    await act(() => owners.forEach((companion) => companion.advance(350)));
    expect(order).toEqual(['measure', 'measure', 'measure', 'scroll', 'scroll', 'scroll']);
  } finally {
    await act(() => root.unmount());
    owners.forEach((companion) => companion.dispose());
    node.remove();
    height.mockRestore();
    viewport.mockRestore();
    scroll.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('sounds only fresh playback and silences a Bot on background, stale sync, archive and unmount', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  const send = (type: string, value: unknown) =>
    events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
  const baseline = (paused = false) =>
    send('companion/baseline', {
      profileId: 'qa',
      bot: { slug: 'ada', name: 'Ada', paused },
      activity: { generation: 'host', revision: 0, bots: [] },
    });
  await companion.start();
  companion.select('ada');
  baseline();
  const sound = new CompanionSound();
  const play = vi.spyOn(sound, 'play');
  const stop = vi.spyOn(sound, 'stop');
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
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
  const visibility = vi.spyOn(document, 'hidden', 'get');
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          sound,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    await act(() =>
      send('companion/message', {
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'new',
        body: 'abcdefghijklmno',
        source: 'own-dm',
      }),
    );
    expect(play).not.toHaveBeenCalled();
    await advanceFrames(4);
    expect(play).toHaveBeenCalledOnce();
    const shown = companion.getSnapshot().cards[0]!.shown;
    visibility.mockReturnValue(true);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(stop).toHaveBeenLastCalledWith('ada');
    await advanceFrames(100);
    expect(play).toHaveBeenCalledOnce();
    expect(companion.getSnapshot().cards[0]!.shown).toBe(shown);
    visibility.mockReturnValue(false);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advanceFrames(4);
    expect(play).toHaveBeenCalledTimes(2);
    expect(companion.getSnapshot().cards[0]!.shown - shown).toBeLessThanOrEqual(2);
    await act(() => events.dispatchEvent(new Event('error')));
    expect(stop).toHaveBeenLastCalledWith('ada');
    await advanceFrames(4);
    expect(play).toHaveBeenCalledTimes(2);
    await act(() => baseline(true));
    expect(stop).toHaveBeenLastCalledWith('ada');
    await advanceFrames(4);
    expect(play).toHaveBeenCalledTimes(2);
    stop.mockClear();
    await act(() => root.unmount());
    expect(stop).toHaveBeenLastCalledWith('ada');
    expect(frames.size).toBe(0);
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    sound.dispose();
    node.remove();
    visibility.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

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

it('enables Group playback from the native menu and explains why a Bot-only source cannot open', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const paths: string[] = [];
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: (path) => {
      paths.push(path);
      return { addEventListener: events.addEventListener.bind(events), close() {} };
    },
  });
  const baseline = () =>
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          bot: { slug: 'ada', name: 'Ada', paused: false },
          activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'thinking' }] },
        }),
      }),
    );
  await companion.start();
  companion.select('ada');
  baseline();
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const openChannel = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel,
          t: zhTranslate,
        }),
      ),
    );
    const menu = async (label: string) => {
      await act(() =>
        node
          .querySelector('.bh-companion')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      const button = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent === label,
      )!;
      expect(button.disabled).toBe(false);
      await act(() => button.click());
      await act(() => baseline());
      await act(() => vi.advanceTimersByTime(800));
    };
    await menu('播放群聊消息');
    expect(new URL(paths.at(-1)!, 'http://localhost').searchParams.get('group')).toBe('1');
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'group',
            channelId: 'design',
            channelName: 'Design room',
            body: 'Group reply',
            source: 'shared-group',
            canOpen: true,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    const shared = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '群聊 · Design room',
    )!;
    await act(() => shared.click());
    expect(openChannel).toHaveBeenCalledExactlyOnceWith('design', 'group');
    await act(() =>
      node.querySelector<HTMLButtonElement>('.bh-companion-bubble header > button')!.click(),
    );
    expect(node.querySelector('.bh-companion-bubble')).toBeNull();
    await menu('Bot 加入的所有会话');
    expect(new URL(paths.at(-1)!, 'http://localhost').searchParams.get('visibility')).toBe(
      'all-bot',
    );
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'bots',
            channelId: 'bot-dm',
            channelName: 'Ada and Grace',
            body: 'Bot reply',
            source: 'bot-dm',
            participants: ['Ada', 'Grace'],
            canOpen: true,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    const botDmSource = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '私聊 · Ada and Grace',
    )!;
    expect(botDmSource.disabled).toBe(false);
    expect(node.textContent).toContain('Ada ↔ Grace');
    openChannel.mockRejectedValueOnce(new Error('Permission changed'));
    await act(async () => botDmSource.click());
    expect(openChannel).toHaveBeenLastCalledWith('bot-dm', 'bots');
    expect(node.textContent).toContain('当前无法读取原会话，仍可查看消息来源。');
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'private-group',
            channelId: 'private-group',
            channelName: 'Bot workroom',
            body: 'Bot-only Group reply',
            source: 'bot-group',
            canOpen: false,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    expect(node.querySelectorAll('.bh-companion-bubble')).toHaveLength(1);
    expect(node.querySelector('.bh-companion-queue')?.textContent).toBe('+1');
    await menu('播放私聊消息');
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual(['private-group']);
    const privateSource = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '群聊 · Bot workroom',
    )!;
    expect(privateSource.disabled).toBe(true);
    expect(node.textContent).toContain('当前无法读取原会话，仍可查看消息来源。');
    await act(() => privateSource.click());
    expect(openChannel).toHaveBeenCalledTimes(2);
    expect(companion.getSnapshot().activity?.state).toBe('thinking');
    const character = node.querySelector<HTMLButtonElement>('.bh-companion-character')!;
    await act(() => character.focus());
    const dismiss = node.querySelector<HTMLButtonElement>('.bh-companion-bubble header > button')!;
    await act(() => dismiss.focus());
    await act(() => dismiss.click());
    expect(node.querySelector('.bh-companion-bubble')).toBeNull();
    expect(document.activeElement).toBe(character);
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/activity', {
          data: JSON.stringify({
            profileId: 'qa',
            bot: {
              slug: 'ada',
              name: 'Ada',
              paused: true,
              avatar: '/snapshot?v=unknown',
              appearance: {
                revision: 'a'.repeat(64),
                recipe: {
                  family: 'illustrated',
                  schemaVersion: 999,
                  assetVersion: 999,
                  rigVersion: 999,
                },
              },
            },
            activity: {
              generation: 'host',
              revision: 2,
              bots: [{ slug: 'ada', state: 'working' }],
            },
          }),
        }),
      ),
    );
    expect(node.textContent).not.toContain('已归档');
    expect(character.title).toContain('已归档');
    expect(character.title).toContain('此版本无法播放形象动作，使用保存的快照');
    expect(node.querySelector('img')?.getAttribute('src')).toBe('/snapshot?v=unknown');
    expect(node.querySelector('[data-static="true"]')).not.toBeNull();
    expect(node.querySelector('[data-state="working"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    frames.set(++frameId, callback);
    return frameId;
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
      observe() {
        intersect = this.callback;
      }
      disconnect = disconnected;
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
    await act(() => intersect!([{ target: stage, isIntersecting: false }]));
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

it('keeps two speaking companions from overlapping and moves their condition onto the Avatar instead of a status line', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { CompanionBubbles } = await import('../src/client/companion-bubbles.js');
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const measurement = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 768,
    width: 400,
    height: 768,
    toJSON: () => ({}),
  });
  const owners: WindowCompanion[] = [];
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    for (const slug of ['ada', 'grace']) {
      const events = new EventTarget();
      const owner = new WindowCompanion({
        context: async () => ({ profileId: 'qa' }),
        source: () => ({
          addEventListener: events.addEventListener.bind(events),
          close() {},
        }),
      });
      owners.push(owner);
      await owner.start();
      owner.select(slug);
      owner.configure({ activity: false, walking: false });
      events.dispatchEvent(
        new MessageEvent('companion/baseline', {
          data: JSON.stringify({
            profileId: 'qa',
            bot: {
              slug,
              name: slug,
              paused: false,
              ...(slug === 'grace' ? { avatar: '/image' } : {}),
            },
            activity: { generation: 'host', revision: 1, bots: [] },
          }),
        }),
      );
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: slug,
            channelId: 'dm',
            channelName: slug,
            messageId: 'hello',
            body: 'Hello there.',
            source: 'own-dm',
          }),
        }),
      );
    }
    const bubbles = new CompanionBubbles();
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          ...owners.map((owner, index) =>
            createElement(WindowCompanionView, {
              key: index,
              companion: owner,
              bubbles,
              openDm() {},
              openAttention() {},
              openChannel() {},
              t: zhTranslate,
            }),
          ),
        ),
      ),
    );
    await act(() => {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(performance.now() + 50);
    });
    expect(node.querySelector('.bh-companion-activity')).toBeNull();
    const characters = [...node.querySelectorAll<HTMLElement>('.bh-companion-character')];
    expect(characters[0]!.title).toBe('');
    expect(characters[1]!.title).toContain('静态图片');
    const speech = [...node.querySelectorAll<HTMLElement>('.bh-companion-bubble')];
    expect(speech).toHaveLength(2);
    expect(speech[0]!.style.bottom).not.toBe(speech[1]!.style.bottom);
    expect(
      speech.every(
        (bubble) =>
          Number.parseFloat(bubble.style.bottom) >= 8 &&
          Number.parseFloat(bubble.style.bottom) <= 728,
      ),
    ).toBe(true);
  } finally {
    await act(() => root.unmount());
    owners.forEach((owner) => owner.dispose());
    expect(frames.size).toBe(0);
    measurement.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('draws the companion bubble and controls from design-system styles by role and name', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  const send = (type: string, value: unknown) =>
    events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
  await companion.start();
  companion.select('ada');
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host', revision: 0, bots: [] },
  });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const named = (selector: string, name: string) =>
    [...node.querySelectorAll<HTMLElement>(selector)].find(
      (item) => item.getAttribute('aria-label') === name,
    );
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
    await act(() => {
      send('companion/message', {
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'hello',
        body: 'Hello there.',
        source: 'own-dm',
      });
      companion.advance(350);
    });
    expect(named('section', zhTranslate('companion.label', { name: 'Ada' }))?.className).toMatch(
      /^bh-companion bhx/,
    );
    const bubble = named('article', zhTranslate('companion.messages'))!;
    expect(bubble.className).toMatch(/^bh-companion-bubble bhx/);
    expect(named('button', zhTranslate('companion.dismiss'))?.className).toMatch(/^bhx/);
    expect(bubble.querySelector('header')?.className).toMatch(/^bhx/);
    for (const name of [
      zhTranslate('companion.openDm'),
      zhTranslate('companion.pause'),
      zhTranslate('companion.more'),
    ])
      expect(named('button', name)?.className, name).toMatch(/^bhx/);
    expect(named('button', zhTranslate('companion.openDm'))?.closest('div')?.className).toMatch(
      /^bh-companion-toolbar bhx/,
    );
    expect(named('button', zhTranslate('companion.drag', { name: 'Ada' }))?.className).toMatch(
      /^bh-companion-character bhx/,
    );
    expect(WINDOW_COMPANION_CSS).not.toContain('--bh-companion-surface');
    expect(WINDOW_COMPANION_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    vi.unstubAllGlobals();
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

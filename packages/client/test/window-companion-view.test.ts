// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { WINDOW_COMPANION_CSS } from '../src/client/window-companion-styles.js';
import { menuItem } from './primitive-mocks.js';
import { zhTranslate } from '../src/client/locale.js';
import { CompanionSound } from '../src/client/companion-sound.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
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
      const button = menuItem(label);
      expect(button.getAttribute('aria-disabled')).not.toBe('true');
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
    await act(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await act(() => vi.advanceTimersByTime(800));
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

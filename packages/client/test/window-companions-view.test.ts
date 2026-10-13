// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanions } from '../src/client/window-companions.js';
import { WindowCompanionsView, CompanionSettings } from '../src/client/window-companions-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { GroupChannelHeader } from '../src/client/group-channel-header.js';
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
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Switch: ({
    checked,
    onChange,
    label,
    disabled,
  }: {
    checked: boolean;
    onChange(value: boolean): void;
    label: string;
    disabled: boolean;
  }) =>
    createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-label': label,
      'aria-checked': checked,
      disabled,
      onClick: () => onChange(!checked),
    }),
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: {
    children: ReactNode;
    size?: string;
    variant?: string;
  }) => createElement('button', props, children),
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
  IconPinFillRegular: () => null,
  IconPinOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

it('pins independently, exposes right-click controls and applies global bounded card capacity', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const frames = new Map<number, FrameRequestCallback>();
  let frame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frame, callback);
    return frame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let stageWidth = 1000;
  let stageHeight = window.innerHeight;
  const measurement = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('bh-persona-avatar')) {
        const position = companionPosition(this.closest<HTMLElement>('.bh-companion')!);
        return new DOMRect(
          Number.parseFloat(position.left),
          window.innerHeight - Number.parseFloat(position.bottom) - 96,
          96,
          96,
        );
      }
      return new DOMRect(0, 0, stageWidth, stageHeight);
    });
  const events = new EventTarget();
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
    update: async () => {},
  });
  await owner.start();
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const listeners = vi.spyOn(document, 'addEventListener');
  const removals = vi.spyOn(document, 'removeEventListener');
  const unlock = vi.spyOn(CompanionSound.prototype, 'unlock');
  try {
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          createElement(GroupChannelHeader, {
            companion: owner,
            channel: {
              id: 'qa-group',
              type: 'group',
              name: 'QA',
              members: ['ada', 'grace'],
              createdAt: '2026-10-08T00:00:00Z',
              updatedAt: '2026-10-08T00:00:00Z',
            },
            title: 'QA',
            members: [
              { personaBotId: 'ada', name: 'Ada' },
              { personaBotId: 'grace', name: 'Grace' },
            ],
            expanded: false,
            onOpenActivity() {},
            onToggleProfile() {},
            t: zhTranslate,
          }),
          createElement(WindowCompanionsView, {
            companion: owner,
            openDm() {},
            openChannel() {},
            openAttention() {},
            t: zhTranslate,
          }),
          createElement(CompanionSettings, { companion: owner, t: zhTranslate }),
        ),
      ),
    );
    const pins = node.querySelectorAll<HTMLButtonElement>('.bh-companion-pin');
    expect(listeners).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(unlock).not.toHaveBeenCalled();
    expect(pins).toHaveLength(2);
    expect(pins[0]!.getAttribute('aria-label')).toContain('Ada');
    expect(pins[1]!.getAttribute('aria-label')).toContain('Grace');
    expect(node.querySelector('button button')).toBeNull();
    await act(() => {
      pins[0]!.click();
      pins[1]!.click();
    });
    await act(() => {
      events.dispatchEvent(
        new MessageEvent('companion/baseline', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'one',
            bots: [],
            activity: { generation: 'host', revision: 0, bots: [] },
          }),
        }),
      );
      events.dispatchEvent(
        new MessageEvent('companion/selection', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'one',
            bots: [
              { slug: 'ada', name: 'Ada', paused: false },
              { slug: 'grace', name: 'Grace', paused: false },
            ],
            activity: {
              generation: 'host',
              revision: 1,
              bots: [
                { slug: 'ada', state: 'working' },
                { slug: 'grace', state: 'thinking' },
              ],
            },
          }),
        }),
      );
    });
    expect(node.querySelectorAll('.bh-companion-character')).toHaveLength(2);
    await act(() => {
      for (const botId of ['ada', 'grace'])
        events.dispatchEvent(
          new MessageEvent('companion/message', {
            data: JSON.stringify({
              generation: 'host',
              botId,
              messageId: `${botId}-hello`,
              channelId: `${botId}-dm`,
              channelName: botId,
              body: `Hello from ${botId}.`,
            }),
          }),
        );
    });
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now());
    });
    expect(node.querySelector('.bh-companion-activity')).toBeNull();
    const bubbles = [...node.querySelectorAll<HTMLElement>('.bh-companion-bubble')];
    expect(bubbles).toHaveLength(2);
    const positions = bubbles.map((bubble) => ({
      x:
        Number.parseFloat(bubble.style.left) +
        Number.parseFloat(companionPosition(bubble.closest<HTMLElement>('.bh-companion')!).left),
      y: Number.parseFloat(bubble.style.bottom),
    }));
    expect(
      Math.abs(positions[0]!.x - positions[1]!.x) >= 328 ||
        Math.abs(positions[0]!.y - positions[1]!.y) >= 32,
    ).toBe(true);
    expect([...pins].map((pin) => pin.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    const grace = node.querySelector<HTMLElement>('[data-bot="grace"]')!;
    await act(() => {
      for (let i = 0; i < 3; i++)
        events.dispatchEvent(
          new MessageEvent('companion/message', {
            data: JSON.stringify({
              generation: 'host',
              botId: 'grace',
              messageId: `grace-${i}`,
              channelId: 'grace-dm',
              channelName: 'Grace',
              body: `Grace ${i}`,
            }),
          }),
        );
    });
    await act(() => grace.querySelector<HTMLButtonElement>('.bh-companion-character')!.focus());
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now() + 30);
    });
    const readingAnchor = grace.querySelector<HTMLElement>('.bh-companion-bubble')!.style.bottom;
    await act(() => {
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'one',
            channelId: 'ada-dm',
            channelName: 'Ada',
            body: 'Independent message',
          }),
        }),
      );
    });
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now() + 60);
    });
    expect(owner.get('grace')!.getSnapshot().reading).toBe(true);
    expect(grace.querySelector<HTMLElement>('.bh-companion-bubble')!.style.bottom).toBe(
      readingAnchor,
    );
    expect(grace.querySelectorAll('.bh-companion-bubble')).toHaveLength(1);
    expect(grace.querySelector('.bh-companion-queue')?.textContent).toBe('+3');
    expect(grace.textContent).not.toContain('Independent message');
    const bounds = (botId: string) => {
      const character = node.querySelector<HTMLElement>(`[data-bot="${botId}"]`)!;
      const bubble = character.querySelector<HTMLElement>('.bh-companion-bubble')!;
      const position = companionPosition(character);
      const left = Number.parseFloat(position.left) + Number.parseFloat(bubble.style.left);
      const bottom = Number.parseFloat(position.bottom) + Number.parseFloat(bubble.style.bottom);
      return { left, right: left + 300, bottom, top: bottom + 112 };
    };
    const graceBounds = bounds('grace');
    const adaBounds = bounds('ada');
    expect(
      adaBounds.right <= graceBounds.left ||
        adaBounds.left >= graceBounds.right ||
        adaBounds.top <= graceBounds.bottom ||
        adaBounds.bottom >= graceBounds.top,
    ).toBe(true);
    await act(() => {
      owner.get('grace')!.reading(false);
      for (const card of owner.get('grace')!.getSnapshot().cards)
        owner.get('grace')!.dismiss(card.messageId);
    });
    for (let tick = 1; tick <= 2; tick++)
      await act(() => {
        for (const callback of [...frames.values()]) callback(performance.now() + tick * 60);
      });
    expect(
      node.querySelector<HTMLElement>('[data-bot="ada"] .bh-companion-bubble')!.style.bottom,
    ).toBe('112px');
    const ada = node.querySelector<HTMLElement>('[data-bot="ada"]')!;
    await act(() =>
      ada.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(ada.querySelector('[aria-expanded="true"]')).not.toBeNull();
    const walking = [...ada.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '暂停走动',
    )!;
    await act(() => walking.click());
    expect(owner.get('ada')!.getSnapshot().selection?.walking).toBe(false);
    expect(owner.get('grace')!.getSnapshot().selection?.walking).toBe(true);
    vi.stubGlobal('innerHeight', 640);
    stageWidth = 360;
    stageHeight = 640;
    await act(() => {
      owner.configureCapacity({ layers: 10, retention: 10 });
      for (const botId of ['ada', 'grace']) {
        owner.get(botId)!.reading(false);
        owner.get(botId)!.configure({ walking: false });
        for (let i = 0; i < 10; i++)
          events.dispatchEvent(
            new MessageEvent('companion/message', {
              data: JSON.stringify({
                generation: 'host',
                botId,
                messageId: `${botId}-narrow-${i}`,
                channelId: botId,
                channelName: botId,
                body: 'Narrow viewport',
              }),
            }),
          );
      }
      window.dispatchEvent(new Event('resize'));
    });
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now() + 120);
    });
    const narrowAda = bounds('ada');
    const narrowGrace = bounds('grace');
    expect(narrowAda.top).toBeLessThanOrEqual(624);
    expect(narrowGrace.top).toBeLessThanOrEqual(624);
    expect(narrowAda.left).toBeGreaterThanOrEqual(8);
    expect(narrowGrace.right).toBeLessThanOrEqual(352);
    expect(narrowAda.top <= narrowGrace.bottom || narrowGrace.top <= narrowAda.bottom).toBe(true);
    const input = node.querySelector<HTMLInputElement>(
      'input[role="spinbutton"][aria-label="每个伙伴保留数量"]',
    )!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(owner.getSnapshot().capacity).toEqual({ layers: 2, retention: 2 });
    expect(owner.get('grace')!.getSnapshot().capacity.retention).toBe(2);
    const speech = node.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(speech.getAttribute('aria-checked')).toBe('false');
    await act(() => speech.click());
    expect(owner.getSnapshot().speechSound).toBe(true);
    expect(speech.getAttribute('aria-checked')).toBe('true');
    await act(() => speech.click());
    expect(owner.getSnapshot().speechSound).toBe(false);
    await act(() => pins[0]!.click());
    expect(node.querySelector('[data-bot="ada"]')).toBeNull();
    expect(node.querySelector('[data-bot="grace"]')).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    expect(removals).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    listeners.mockRestore();
    removals.mockRestore();
    unlock.mockRestore();
    node.remove();
    owner.dispose();
    measurement.mockRestore();
    vi.unstubAllGlobals();
  }
});

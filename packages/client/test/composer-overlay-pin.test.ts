// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Button: ({
    icon: _icon,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: unknown;
    variant?: string;
    size?: string;
  }) => createElement('button', props),
  FileTypeIcon: () => null,
  fileSizeText: (size: number) => `${size} B`,
  IconCloseOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  IconSkillOutlineRegular: () => null,
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';

let host: HTMLDivElement;
let root: Root;
let resize: () => void;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  host.className = 'bh-chat-pane';
  host.innerHTML = '<div class="bh-chat-body"></div><div class="bh-slot"></div>';
  document.body.append(host);
  root = createRoot(host.querySelector('.bh-slot')!);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) {
        resize = callback;
      }
    },
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function scroller(element: HTMLElement, metrics: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { get: () => metrics.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { get: () => metrics.clientHeight });
  return metrics;
}

async function mount(): Promise<void> {
  await act(async () =>
    root.render(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Message',
        sending: false,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    ),
  );
}

describe('Composer overlay pinning', () => {
  it('keeps the latest message pinned while the composer grows into the list', async () => {
    const timeline = host.querySelector<HTMLElement>('.bh-chat-body')!;
    const metrics = scroller(timeline, { scrollHeight: 1000, clientHeight: 400 });
    timeline.scrollTop = 600;
    await mount();
    metrics.clientHeight = 380;
    resize();
    expect(timeline.scrollTop).toBe(1000);
    timeline.dispatchEvent(new Event('scroll'));
    timeline.scrollTop = 600;
    metrics.clientHeight = 360;
    resize();
    expect(timeline.scrollTop).toBe(1000);
  });

  it('leaves a reader who scrolled up where they are', async () => {
    const timeline = host.querySelector<HTMLElement>('.bh-chat-body')!;
    const metrics = scroller(timeline, { scrollHeight: 1000, clientHeight: 400 });
    timeline.scrollTop = 600;
    await mount();
    timeline.scrollTop = 200;
    timeline.dispatchEvent(new Event('scroll'));
    metrics.clientHeight = 380;
    resize();
    expect(timeline.scrollTop).toBe(200);
  });
});

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

async function mount(onOverlayResize: (timeline: HTMLElement) => void): Promise<void> {
  await act(async () =>
    root.render(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Message',
        sending: false,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onOverlayResize,
      }),
    ),
  );
}

describe('Composer overlay', () => {
  it('sets the overlay on the timeline before the owner re-pins it on every resize', async () => {
    const timeline = host.querySelector<HTMLElement>('.bh-chat-body')!;
    const shell = () => host.querySelector<HTMLElement>('.bh-composer-shell')!;
    let top = 700;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect);
    const seen: string[] = [];
    await mount((target) => seen.push(target.style.getPropertyValue('--bh-composer-overlay')));
    vi.spyOn(shell(), 'getBoundingClientRect').mockImplementation(
      () => ({ top, height: 800 - top }) as DOMRect,
    );
    resize();
    top = 680;
    resize();
    resize();
    expect(seen.slice(-3)).toEqual(['100px', '120px', '120px']);
    expect(timeline.style.getPropertyValue('--bh-composer-overlay')).toBe('120px');
  });

  it('drops the overlay while the Composer is hidden', async () => {
    const timeline = host.querySelector<HTMLElement>('.bh-chat-body')!;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect);
    await mount(vi.fn());
    vi.spyOn(
      host.querySelector<HTMLElement>('.bh-composer-shell')!,
      'getBoundingClientRect',
    ).mockReturnValue({ top: 0, height: 0 } as DOMRect);
    resize();
    expect(timeline.style.getPropertyValue('--bh-composer-overlay')).toBe('0px');
  });
});

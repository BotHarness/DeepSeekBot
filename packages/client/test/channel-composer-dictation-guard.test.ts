// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: PropsWithChildren) => children,
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: () => null,
  fileSizeText: (size: number) => `${size} B`,
  IconCloseOutlineRegular: () => null,
  IconMicrophoneOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import type { DictationMic, VoiceDictationPort } from '../src/client/composer-dictation.js';

let container: HTMLDivElement;
let root: Root;
const empty = [] as const;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const view = (state: 'listening' | 'done' | 'cancelled') => ({
  id: 'dict-0123456789abcdef',
  providerId: 'asr',
  mode: 'stream' as const,
  state,
  text: '',
  audioMs: 0,
});

const port: VoiceDictationPort = {
  readiness: async () => ({ ready: true, providerId: 'asr', mode: 'stream', sampleRate: 16_000 }),
  open: async () => view('listening'),
  push: async () => view('listening'),
  stop: async () => view('done'),
  cancel: async () => view('cancelled'),
};

const mic: DictationMic = { start: async () => undefined, stop: () => undefined };

function paste(target: Element, files: File[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
      getData: () => '',
    },
  });
  target.dispatchEvent(event);
  return event;
}

describe('Channel composer during dictation', () => {
  it('keeps pasted and picked files out of the draft while listening', async () => {
    const onAddFiles = vi.fn();
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: 'draft',
          placeholder: 'Message',
          sending: false,
          dictation: port,
          dictationMic: mic,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          attachments: [
            {
              id: 'a1',
              file: new File(['x'], 'notes.txt', { type: 'text/plain' }),
              status: 'ready',
            },
          ],
          onAddFiles,
          onChange,
          onSubmit: vi.fn(),
        }),
      ),
    );
    const micButton = container.querySelector<HTMLButtonElement>('.bh-composer-mic')!;
    await act(async () => micButton.click());
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(micButton.getAttribute('aria-pressed')).toBe('true');
    const file = new File(['image'], 'shot.png', { type: 'image/png' });
    const event = paste(container.querySelector('textarea, .bh-composer-rich-input')!, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('.bh-composer-add-file')!.disabled).toBe(
      true,
    );
    const reference = container.querySelector<HTMLButtonElement>('.bh-composer-file-reference')!;
    expect(reference.disabled).toBe(true);
    await act(async () => reference.click());
    expect(onChange).not.toHaveBeenCalled();
  });
});

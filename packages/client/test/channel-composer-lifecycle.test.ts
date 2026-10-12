// @vitest-environment jsdom
import { act, createElement, useState, type ButtonHTMLAttributes } from 'react';
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
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import { attachmentReferenceText } from '../src/client/attachment-refs.js';
import {
  readRichMentionDraft,
  renderRichMentionDraft,
  setRichSelection,
} from '../src/client/rich-mention-editor.js';
import type { BotSummary } from '../src/client/store.js';

const ada: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
};

let host: HTMLDivElement;
let root: Root;
let observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    },
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('mounted Channel composer', () => {
  it('reinserts a file at the caret and deletes only the inline chip', async () => {
    const attachment = {
      id: 'report',
      file: new File(['hello'], 'report.txt'),
      status: 'ready' as const,
    };
    const onChange = vi.fn();
    const onRemoveAttachment = vi.fn();
    const render = async (value: string) =>
      act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value,
            placeholder: 'Message',
            sending: false,
            attachments: [attachment],
            onChange,
            onSubmit: vi.fn(),
            onRemoveAttachment,
          }),
        ),
      );
    await render('before after');
    const editor = host.querySelector<HTMLElement>('[contenteditable]')!;
    setRichSelection(editor, 7);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="在正文中引用 report.txt"]')!.click(),
    );
    const next = `before ${attachmentReferenceText(attachment)} after`;
    expect(onChange).toHaveBeenLastCalledWith(next, [], []);
    await render(next);
    expect(host.querySelector('[data-attachment-id="report"]')?.textContent).toBe('1report.txt5 B');
    setRichSelection(editor, 7 + attachmentReferenceText(attachment).length);
    await act(async () =>
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
      ),
    );
    expect(onChange).toHaveBeenLastCalledWith('before after', [], []);
    expect(onRemoveAttachment).not.toHaveBeenCalled();
  });

  it('refreshes upload status without losing the inline identity or caret', async () => {
    const attachment = {
      id: 'report',
      file: new File(['hello'], 'report.txt'),
      status: 'uploading' as const,
    };
    const value = attachmentReferenceText(attachment) + ' ';
    const render = async (status: 'uploading' | 'error' | 'ready') =>
      act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value,
            placeholder: 'Message',
            sending: false,
            attachments: [{ ...attachment, status }],
            onChange: vi.fn(),
            onSubmit: vi.fn(),
          }),
        ),
      );
    await render('uploading');
    const editor = host.querySelector<HTMLElement>('[contenteditable]')!;
    editor.focus();
    setRichSelection(editor, value.length);
    await render('error');
    expect(host.querySelector('[data-attachment-id="report"]')?.getAttribute('data-status')).toBe(
      'error',
    );
    expect(
      host.querySelector('[data-attachment-id="report"]')?.getAttribute('data-attachment-text'),
    ).toBe(attachmentReferenceText(attachment));
    await render('ready');
    expect(host.querySelector('[data-attachment-id="report"]')?.getAttribute('aria-busy')).toBe(
      'false',
    );
  });
  it('filters slash actions, preserves drafts and attachments, cancels and never submits shortcuts', async () => {
    const model = vi.fn();
    const workspace = vi.fn();
    const onSubmit = vi.fn();
    const attachment = {
      id: 'file',
      file: new File(['proof'], 'proof.txt'),
      status: 'ready' as const,
    };
    function Harness() {
      const [value, setValue] = useState('keep this draft');
      return createElement(ChannelComposer, {
        value,
        placeholder: 'Message',
        sending: false,
        attachments: [attachment],
        context: {
          target: 'ada',
          content: createElement('span', null, 'Context'),
          shortcuts: [
            { id: 'model', label: 'Model', run: model },
            { id: 'workspace', label: 'Workspace', run: workspace },
          ],
        },
        onChange: setValue,
        onSubmit,
      });
    }
    await act(async () => root.render(createElement(Harness)));
    const input = host.querySelector<HTMLElement>('[contenteditable]')!;
    const type = async (value: string) =>
      act(async () => {
        renderRichMentionDraft(input, value, [], []);
        setRichSelection(input, value.length);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await type('keep this draft\n/');
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(workspace).toHaveBeenCalledOnce();
    expect(readRichMentionDraft(input).value).toBe('keep this draft\n');
    expect(host.textContent).toContain('proof.txt');
    expect(onSubmit).not.toHaveBeenCalled();
    await type('keep this draft\n/mo');
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(readRichMentionDraft(input).value).toBe('keep this draft\n');
    expect(model).not.toHaveBeenCalled();
    await type('ordinary /model text');
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('uses touch/click without sending and refuses a menu opened for an old target', async () => {
    const run = vi.fn();
    const onSubmit = vi.fn();
    let target = 'ada';
    let value = '';
    const render = async () =>
      act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value,
            placeholder: 'Message',
            sending: false,
            context: { target, content: null, shortcuts: [{ id: 'model', label: target, run }] },
            onChange: (next) => {
              value = next;
            },
            onSubmit,
          }),
        ),
      );
    await render();
    const input = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '/',
      );
      input.setSelectionRange(1, 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    expect(run).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    value = '';
    await render();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '/',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await render();
    target = 'grace';
    await render();
    expect(host.querySelector('[role="menuitem"]')).toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });
  it('selects All Bots with a visible recipient count without submitting or selecting a Bot ID', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: [ada],
          allBotPreview: { revision: 'preview', recipients: [{ botSlug: 'ada', label: 'Ada' }] },
          onChange,
          onSubmit,
        }),
      ),
    );
    const editor = host.querySelector<HTMLElement>('[contenteditable]')!;
    await act(async () => {
      editor.textContent = '@';
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    const option = [...host.querySelectorAll<HTMLButtonElement>('[role=option]')].find((button) =>
      button.textContent?.includes('所有 Bot'),
    );
    expect(option?.textContent).toContain('1');
    await act(async () => option?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      '@所有 Bot ',
      [
        {
          kind: 'all-bots',
          label: '所有 Bot',
          start: 0,
          end: 7,
          preview: { revision: 'preview', recipients: [{ botSlug: 'ada', label: 'Ada' }] },
        },
      ],
      [],
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('focuses only on a reply or focus request and disconnects the prior input observer', async () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const render = async (props: {
      value?: string;
      reply?: { id: string; author: string; body: string };
      focusSignal?: number;
      rich?: boolean;
    }) => {
      await act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value: props.value ?? '',
            placeholder: 'Message Ada',
            sending: false,
            ...(props.reply === undefined ? {} : { reply: props.reply }),
            ...(props.focusSignal === undefined ? {} : { focusSignal: props.focusSignal }),
            mentionCandidates: props.rich ? [ada] : [],
            onChange,
            onSubmit,
          }),
        ),
      );
    };
    await render({});
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observe).toHaveBeenCalledWith(host.querySelector('textarea'));

    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      outside.focus();
      await render({ reply: { id: 'message-1', author: 'Ada', body: 'Original' } });
      expect(document.activeElement).toBe(host.querySelector('textarea'));
      expect(observers[0]?.disconnect).toHaveBeenCalledOnce();

      outside.focus();
      await render({ value: 'draft', reply: { id: 'message-1', author: 'Ada', body: 'Original' } });
      expect(document.activeElement).toBe(outside);
      expect(observers).toHaveLength(2);

      await render({ value: 'draft', focusSignal: 1 });
      expect(document.activeElement).toBe(host.querySelector('textarea'));
      await act(async () =>
        host
          .querySelector('textarea')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      );
      expect(onSubmit).toHaveBeenCalledOnce();
      await act(async () =>
        host
          .querySelector('textarea')
          ?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
          ),
      );
      expect(onSubmit).toHaveBeenCalledOnce();

      await render({ value: 'draft', focusSignal: 1, rich: true });
      expect(host.querySelector('[role="textbox"]')).not.toBeNull();
      expect(observers.at(-1)?.observe).toHaveBeenCalledWith(
        host.querySelector('[role="textbox"]'),
      );
    } finally {
      outside.remove();
    }
    await act(async () => root.render(null));
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });
});

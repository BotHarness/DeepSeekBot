import {
  createElement,
  type ButtonHTMLAttributes,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PersonaBotFacepileItem } from '../src/client/avatar.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  ImageLightbox: () => null,
  fileSizeText: (size: number) => `${size} B`,
}));

import {
  ChannelComposer,
  fitComposerTextarea,
  shouldSubmitComposerKey,
} from '../src/client/channel-composer.js';

describe('Channel composer', () => {
  it('shows a selected Bot only inside the draft, without a second chip row', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '@Ada hello',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        placeholder: 'Message',
        sending: false,
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('class="bh-composer-input bh-composer-rich-input"');
    expect(markup).toContain('role="textbox"');
    expect(markup).not.toContain('bh-composer-mention-mirror');
    expect(markup).not.toContain('bh-composer-selected-mentions');
  });

  it('renders no status chrome above the composer', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: '发消息',
        sending: true,
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).not.toContain('bh-composer-activity-status');
    expect(markup).toContain('class="bh-composer bh-composer-compact"');
    expect(markup).toContain('disabled=""');
  });

  it('keeps a cancellable reply quote inside the composer island', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: 'answer',
        placeholder: 'Message Ada',
        sending: false,
        reply: { id: 'm1', author: 'Ada', body: 'original text' },
        onChange: () => undefined,
        onCancelReply: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('bh-composer-replying');
    expect(markup).toContain('bh-composer-with-footer');
    expect(markup).toContain('bh-composer-reply-copy');
    expect(markup).toContain('original text');
    expect(markup).toContain('bh-composer-reply-cancel');
    expect(markup).toContain('answer');
  });

  it('keeps failed uploads visible and blocks sending until retry succeeds', () => {
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    const render = (status: 'error' | 'ready') =>
      renderToStaticMarkup(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message Ada',
          sending: false,
          attachments: [
            {
              id: 'upload-1',
              file,
              status,
              ...(status === 'error'
                ? { error: 'network unavailable' }
                : {
                    ref: {
                      hash: `sha256:${'a'.repeat(64)}`,
                      name: 'report.pdf',
                      mime: 'application/pdf',
                      size: 6,
                    },
                  }),
            },
          ],
          onChange: () => undefined,
          onSubmit: () => undefined,
        }),
      );

    const failed = render('error');
    expect(failed).toContain('bh-composer-with-footer');
    expect(failed).toContain('report.pdf');
    expect(failed).toContain('title="network unavailable"');
    expect(failed).toContain('重试');
    expect(failed.match(/<button class="bh-send-btn"[^>]*>/u)?.[0]).toContain('disabled=""');

    const ready = render('ready');
    expect(ready.match(/<button class="bh-send-btn"[^>]*>/u)?.[0]).not.toContain('disabled');
  });

  it('renders image previews and document files as distinct attachment shapes', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Message Ada',
        sending: false,
        attachments: [
          {
            id: 'image-1',
            file: new File(['image'], 'capture.png', { type: 'image/png' }),
            status: 'ready',
          },
          {
            id: 'document-1',
            file: new File(['document'], 'a-very-long-report-name-that-needs-truncation.docx', {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            status: 'uploading',
          },
        ],
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).toContain('class="bh-composer-attachment-card bh-composer-image-attachment"');
    expect(markup).toContain('class="bh-composer-image-preview"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('class="bh-composer-attachment-card bh-composer-file-attachment"');
    expect(markup).toContain(
      'data-file-type-icon="a-very-long-report-name-that-needs-truncation.docx"',
    );
    expect(markup).toContain('class="bh-composer-attachment-name"');
    expect(markup).toContain('上传中');
  });

  it('submits plain Enter but preserves multiline and IME input', () => {
    const key = (patch: {
      key?: string;
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    }) =>
      shouldSubmitComposerKey({
        key: patch.key ?? 'Enter',
        shiftKey: patch.shiftKey ?? false,
        nativeEvent: {
          isComposing: patch.isComposing ?? false,
          keyCode: patch.keyCode ?? 13,
        },
      } as never);

    expect(key({})).toBe(true);
    expect(key({ shiftKey: true })).toBe(false);
    expect(key({ isComposing: true })).toBe(false);
    expect(key({ keyCode: 229 })).toBe(false);
    expect(key({ key: 'a' })).toBe(false);
  });

  it('sends with Ctrl or ⌘+Enter when that send key is chosen, leaving Enter for new lines', () => {
    const key = (patch: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) =>
      shouldSubmitComposerKey(
        {
          key: 'Enter',
          shiftKey: patch.shiftKey ?? false,
          ctrlKey: patch.ctrlKey ?? false,
          metaKey: patch.metaKey ?? false,
          nativeEvent: { isComposing: false, keyCode: 13 },
        } as never,
        'mod-enter',
      );

    expect(key({})).toBe(false);
    expect(key({ ctrlKey: true })).toBe(true);
    expect(key({ metaKey: true })).toBe(true);
    expect(key({ metaKey: true, shiftKey: true })).toBe(false);
    expect(
      shouldSubmitComposerKey(
        {
          key: 'Enter',
          shiftKey: false,
          ctrlKey: true,
          nativeEvent: { isComposing: false, keyCode: 13 },
        } as never,
        'enter',
      ),
    ).toBe(true);
  });

  it('grows, shrinks back to one line, and switches to bounded scrolling', () => {
    const style = { height: '', overflowY: '' };
    const element = { scrollHeight: 88, style };

    expect(fitComposerTextarea(element as never)).toEqual({ expanded: true, height: 88 });
    expect(style).toEqual({ height: '88px', overflowY: 'hidden' });

    element.scrollHeight = 34;
    expect(fitComposerTextarea(element as never)).toEqual({ expanded: false, height: 34 });
    expect(style).toEqual({ height: '34px', overflowY: 'hidden' });

    element.scrollHeight = 220;
    expect(fitComposerTextarea(element as never)).toEqual({ expanded: true, height: 144 });
    expect(style).toEqual({ height: '144px', overflowY: 'auto' });
  });
});

it('supports Shift+Enter sending while plain Enter remains a newline', () => {
  const event = {
    key: 'Enter',
    shiftKey: false,
    nativeEvent: { isComposing: false, keyCode: 13 } as KeyboardEvent,
  };
  expect(shouldSubmitComposerKey(event, 'shift-enter')).toBe(false);
  expect(shouldSubmitComposerKey({ ...event, shiftKey: true }, 'shift-enter')).toBe(true);
  expect(
    shouldSubmitComposerKey(
      {
        ...event,
        shiftKey: true,
        nativeEvent: { ...event.nativeEvent, isComposing: true } as KeyboardEvent,
      },
      'shift-enter',
    ),
  ).toBe(false);
});

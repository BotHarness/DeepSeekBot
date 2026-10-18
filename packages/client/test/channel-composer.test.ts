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
  it('renders a compact keyboard disclosure for live activity outside the rounded composer', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: 'hello',
        placeholder: '发消息给 Ada',
        sending: false,
        activity: {
          items: [{ personaBotId: 'ada', name: 'Ada', state: 'thinking' }],
          summary: 'Ada 正在思考',
        },
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).toContain('class="bh-composer-shell"');
    expect(markup).toContain('class="bh-composer-activity-status"');
    expect(markup.indexOf('bh-composer-activity-status')).toBeLessThan(
      markup.indexOf('class="bh-composer bh-composer-'),
    );
    expect(markup).toContain('class="bh-avatar-facepile bh-composer-activity-facepile"');
    expect(markup).toContain('style="width:28px;height:28px"');
    expect(markup).toContain('<details class="bh-composer-activity-status">');
    expect(markup).toContain('<summary');
    expect(markup).toContain('role="status" aria-live="polite"');
    expect(markup).not.toContain('<details open');
    expect(markup).toContain('Ada 正在思考');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('hello');
    expect(markup).toContain('class="bh-composer bh-composer-compact"');
    expect(markup).not.toContain('bh-composer-with-footer');
    expect(markup).toContain('data-layout="compact"');
  });

  it('renders declared public text as escaped content inside the folded disclosure', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Message',
        sending: false,
        activity: {
          summary: 'Opening a browser tab',
          items: [
            {
              personaBotId: 'ada',
              name: 'Ada',
              state: 'working',
              activity: {
                toolKind: 'other',
                effect: 'generic-working',
                startedAt: 1000,
                activeToolCount: 1,
                publicDetail: '<b>Opening a browser tab</b>',
              },
            },
          ],
        },
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('bh-composer-activity-session-latest');
    expect(markup).toContain('&lt;b&gt;Opening a browser tab&lt;/b&gt;');
    expect(markup).not.toContain('<details class="bh-composer-activity-status" open');
  });

  it('discloses the safe trusted execution source and active Session count', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: 'Ada',
        sending: false,
        activity: {
          summary: 'Ada 正在执行',
          items: [
            {
              personaBotId: 'ada',
              name: 'Ada',
              state: 'working',
              activity: {
                effect: 'executing',
                toolKind: 'execute',
                toolName: 'bash',
                startedAt: 1000,
                activeToolCount: 3,
                sources: [{ role: 'assignment', count: 2 }],
              },
            },
          ],
        },
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('任务会话 ×2');
    expect(markup).toContain('3 个工具');
    expect(markup).toContain('bash');
    expect(markup).not.toContain('sessionId');
    expect(markup).not.toContain('<details open');
  });
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

  it('does not render status chrome when no active projection is available', () => {
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

it('puts only the latest activity inside each Session block and does not repeat the Bot name', () => {
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Message',
      sending: false,
      onChange: () => undefined,
      onSubmit: () => undefined,
      activity: {
        summary: 'Ada working',
        items: [
          {
            personaBotId: 'ada',
            name: 'Ada',
            state: 'working',
            sessions: [
              {
                id: 'activity-11111111-1111-4111-8111-111111111111',
                role: 'assignment',
                name: 'Inspect <layout>',
                revision: 1,
                at: 1000,
                state: 'thinking',
              },
              {
                id: 'activity-22222222-2222-4222-8222-222222222222',
                role: 'assignment',
                name: 'Verify compact activity',
                revision: 2,
                at: 2000,
                state: 'working',
                activity: {
                  effect: 'generic-working',
                  toolKind: 'other',
                  toolName: 'browser_tabs',
                  publicDetail: '<public operation>',
                  startedAt: 2000,
                  activeToolCount: 1,
                },
              },
            ],
          },
        ],
      },
    }),
  );
  expect(markup).toContain('<details class="bh-composer-activity-status">');
  expect(markup.match(/class="bh-composer-activity-session"/gu)).toHaveLength(2);
  expect(markup).toContain('Inspect &lt;layout&gt;');
  expect(markup).toContain('Verify compact activity');
  expect(markup).not.toContain('任务会话 1');
  expect(markup).toContain('<ul class="bh-composer-activity-details"');
  expect(markup).toContain('dateTime="1970-01-01T00:00:02.000Z"');
  expect(markup).toContain('&lt;public operation&gt;');
  expect(markup).not.toContain('<public operation>');
  expect(markup).not.toContain('<strong>Ada</strong>');
  expect(markup).not.toContain('bh-composer-activity-trace');
  expect(markup).not.toContain('bh-composer-activity-session-header');
  expect(markup).not.toContain('bh-composer-activity-bot');
});

it('identifies Session ownership with avatars only when multiple Bots are active', () => {
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Group',
      sending: false,
      onChange: () => undefined,
      onSubmit: () => undefined,
      activity: {
        summary: '2 bots working',
        items: ['Ada', 'Bob'].map((name, index): PersonaBotFacepileItem => ({
          personaBotId: name.toLowerCase(),
          name,
          state: 'thinking',
          sessions: [
            {
              id: `activity-${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
              role: 'orchestrator',
              revision: 1,
              at: 1000,
              state: 'thinking',
            },
          ],
        })),
      },
    }),
  );
  const body = markup.slice(markup.indexOf('bh-composer-activity-details'));
  expect(body.match(/class="bh-persona-avatar"/gu)).toHaveLength(2);
  expect(body).toContain('aria-label="Ada：正在思考"');
  expect(body).toContain('aria-label="Bob：正在思考"');
  expect(body).not.toContain('<strong>Ada</strong>');
  expect(body).not.toContain('<strong>Bob</strong>');
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

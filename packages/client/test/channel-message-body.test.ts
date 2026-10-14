// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from '../src/client/actions.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { attachmentReferenceText } from '../src/client/attachment-refs.js';
import { parseChannelMessage } from '../src/client/bridge.js';
import {
  botNameColor,
  contrastRatio,
  parseColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import { seededAvatarFor } from '../../core/src/bots/avatar-appearance.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { toolApprovalText } from '../src/client/approval-text.js';
import { WORKSPACE_GRANTS_CHANGED } from '../src/client/workspace-grants-entry.js';
import { store, type ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  fileSizeText: (bytes: number) =>
    bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)}MB`
      : bytes >= 1024
        ? `${(bytes / 1024).toFixed(1)}KB`
        : `${bytes}B`,
  IconDownloadOutlineRegular: () => null,
  IconPlayOutlineRegular: () => null,
  IconPauseOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  MarkdownText: vi.fn(() => null),
  Modal: () => null,
  StateDot: () => createElement('span', { 'data-state-dot': 'error' }),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
}));

it('renders the restored Host tombstone as purged content', () => {
  const message = parseChannelMessage({
    id: 'purged',
    at: '2026-10-08T00:00:00.000Z',
    author: { kind: 'human' },
    body: '',
    contentPurge: { actor: 'local-human', reason: 'human-request', at: '2026-10-08T00:00:00.000Z' },
  });
  expect(message?.contentPurged).toBe(true);
  expect(
    renderToStaticMarkup(
      createElement(ChannelMessageBody, { message: message!, channelId: 'shared', t: zhTranslate }),
    ),
  ).toContain('正文已清除');
});

function render(
  author: ChannelMessage['author'],
  body: string,
  options: Pick<
    ChannelMessage,
    'format' | 'streaming' | 'attachments' | 'sessionFailure' | 'bridgeOrigin'
  > = {},
) {
  return renderToStaticMarkup(
    createElement(ChannelMessageBody, {
      message: { id: 'm1', at: '2026-09-19T00:00:00.000Z', author, body, ...options },
      channelId: 'channel-owner',
      t: zhTranslate,
    }),
  );
}

beforeEach(() => vi.mocked(MarkdownText).mockClear());

describe('Channel message body', () => {
  it('shows a sent inline reference only for an attachment owned by that message', () => {
    const ref = { fileId: 'file:report', name: 'report.txt', mime: 'text/plain', size: 5 };
    const text = attachmentReferenceText({
      id: 'report',
      file: { name: ref.name, size: ref.size },
      ref,
      status: 'ready',
    });
    const html = render({ kind: 'human' }, `use ${text}`, { attachments: [ref] });
    expect(html).toContain('定位附件 report.txt');
    expect(html).toContain('class="bh-attachment-ordinal">1</span>');
    expect(html).not.toContain('bh-message-attachment-ordinal');
    expect(html).not.toContain('attachment:file%3Areport');
    expect(render({ kind: 'human' }, `use ${text}`)).not.toContain('定位附件 report.txt');
    expect(render({ kind: 'human' }, `use ${text}`)).toContain('attachment:file%3Areport');
  });
  it.each(['text/plain', 'image/png', 'audio/mpeg'])(
    'omits corner numbers from sent %s attachment cards',
    (mime) => {
      const attachments = [{ fileId: 'file:report', name: 'report', mime, size: 5 }];
      const html = render({ kind: 'human' }, 'attached', { attachments });
      expect(html).toContain('bh-message-attachment');
      expect(html).not.toContain('bh-message-attachment-ordinal');
    },
  );
  it.each([
    [
      'qq',
      '<@APP_MEMBER>',
      '<@APP_MEMBER> next <@APP_MEMBER> <@UNKNOWN>',
      '@QA <Bot> next @QA <Bot> <@UNKNOWN>',
    ],
    ['discord', '<@123>', '<@123>next <@123> <@999>', '@QA <Bot>next @QA <Bot> <@999>'],
    ['feishu', '@_user_1', '@_user_1 @_user_10 @_user_1', '@QA <Bot> @_user_10 @QA <Bot>'],
    ['slack', '<@U123>', '<@U123> next <@U123>', '@QA <Bot> next @QA <Bot>'],
  ])(
    'renders checked %s native mentions as inert chips with literal unknown text',
    (platform, key, body, expected) => {
      const bridgeOrigin = {
        sourceEventId: 'native-source',
        platform,
        conversationId: 'conversation',
        conversationName: 'QA',
        messageId: 'native-message',
        senderId: 'sender',
        mentions: [{ id: 'native-id', key, name: 'QA <Bot>' }],
      };
      const html = render({ kind: 'bridged', source: 'Sender' }, body, {
        format: 'text',
        bridgeOrigin,
      });
      const container = document.createElement('div');
      container.innerHTML = html;
      expect(container.textContent).toBe(expected);
      expect(container.querySelectorAll('.bh-external-mention')).toHaveLength(2);
      expect(container.querySelector('.bh-external-mention')?.getAttribute('title')).toBe(
        'native-id',
      );
      expect(container.querySelector('button, script, [data-bot-id], [data-human-id]')).toBeNull();
      expect(body).not.toContain('@QA <Bot>');
      expect(render({ kind: 'human' }, body, { format: 'text', bridgeOrigin })).not.toContain(
        'bh-external-mention',
      );
      expect(
        render({ kind: 'bridged', source: 'Sender' }, body, {
          format: 'text',
          bridgeOrigin: { ...bridgeOrigin, mentions: [{ id: 'native-id', key, name: '   ' }] },
        }),
      ).not.toContain('bh-external-mention');
    },
  );

  it.each(['/chosen/project', null])(
    'uses the native picker on a browse capability refusal and authorizes only a chosen path %s',
    async (path) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const pickWorkspaceFolder = vi.fn(async () => path);
      const resolveWorkspaceGrantRequest = vi.fn(async () => undefined);
      const actions = {
        listHostFolders: async () => {
          throw Object.assign(new Error('native picker'), {
            rpcError: { code: 'directory-picker/unavailable' },
          });
        },
        pickWorkspaceFolder,
        resolveWorkspaceGrantRequest,
      } as unknown as BridgeActions;
      try {
        await act(async () =>
          root.render(
            createElement(ChannelMessageBody, {
              message: {
                id: 'grant-request',
                at: '2026-10-01T10:00:00Z',
                author: { kind: 'bot', slug: 'ada' },
                body: 'Choose a folder',
                grantRequest: true,
              },
              actions,
              t: zhTranslate,
            }),
          ),
        );
        await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
        expect(pickWorkspaceFolder).toHaveBeenCalledOnce();
        if (path === null) expect(resolveWorkspaceGrantRequest).not.toHaveBeenCalled();
        else
          expect(resolveWorkspaceGrantRequest).toHaveBeenCalledWith(
            'ada',
            'grant-request',
            path,
            expect.any(Function),
            undefined,
          );
        expect(container.textContent?.includes('已回复授权请求')).toBe(path !== null);
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    },
  );
  it('opens selected #Group references by stable ID and leaves typed #text inert', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openChannel = vi.fn(async () => undefined);
    store.setRoster(
      [],
      [
        {
          id: 'group-team-2',
          type: 'group',
          name: 'Team',
          members: [],
          createdAt: '2026-09-25T00:00:00.000Z',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
      ],
    );
    try {
      await act(async () => {
        root.render(
          createElement(ChannelMessageBody, {
            message: {
              id: 'm-channel-ref',
              at: '2026-09-25T00:00:00.000Z',
              author: { kind: 'human' },
              body: 'Use #Team and #Plain',
              channelRefs: [{ channelId: 'group-team-2', label: 'Team', start: 4, end: 9 }],
            },
            t: zhTranslate,
            actions: { openChannel } as unknown as BridgeActions,
          }),
        );
      });
      const selected = container.querySelector<HTMLButtonElement>(
        '[data-channel-id="group-team-2"]',
      );
      expect(selected?.textContent).toBe('#Team');
      expect(container.textContent).toContain('#Plain');
      expect(container.querySelectorAll('[data-channel-id]')).toHaveLength(1);
      await act(async () => selected?.click());
      expect(openChannel).toHaveBeenCalledWith('group-team-2');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster([], []);
    }
  });

  it('keeps a deleted #Group reference readable without a broken button', () => {
    store.setRoster([], []);
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'm-deleted-ref',
          at: '2026-09-25T00:00:00.000Z',
          author: { kind: 'human' },
          body: 'See #Team',
          channelRefs: [{ channelId: 'group-deleted', label: 'Team', start: 4, end: 9 }],
        },
        t: zhTranslate,
        actions: { openChannel: vi.fn() } as unknown as BridgeActions,
      }),
    );
    expect(markup).toContain('#Team</span>');
    expect(markup).not.toContain('data-channel-id="group-deleted"');
    expect(markup).not.toContain('<button');
  });

  it('renders selected Bot mentions as inline DM controls in sent text', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'm-mention',
          at: '2026-09-25T00:00:00.000Z',
          author: { kind: 'human' },
          body: '@Ada please ask @Bea',
          mentions: [
            { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
            { botSlug: 'bea', label: 'Bea', start: 16, end: 20 },
          ],
        },
        t: zhTranslate,
        actions: { openBot: vi.fn() } as unknown as BridgeActions,
        bots: [
          {
            slug: 'ada',
            displayName: 'Ada',
            avatar: '/avatars/ada.png',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-25T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(markup).toContain('data-bot-id="ada" aria-label="打开与 Ada 的私聊"');
    expect(markup).toContain('data-bot-id="bea" aria-label="打开与 Bea 的私聊"');
    expect(markup).toContain('src="/avatars/ada.png"');
    expect(markup).toContain('class="bh-inline-mention-avatar" aria-hidden="true"');
    expect(markup).toContain('>Ada</span></button>');
    expect(markup).toContain('>Bea</span></button>');
    expect(markup).not.toContain('bh-composer-selected-mentions');
  });

  it('shows Bot Group @ badges while keeping the following content in native Markdown', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'bot-group-mention',
          at: '2026-09-25T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: '@Bea **please check**',
          mentions: [{ botSlug: 'bea', label: 'Bea', start: 0, end: 4 }],
        },
        t: zhTranslate,
        actions: { openBot: vi.fn() } as unknown as BridgeActions,
      }),
    );
    expect(markup).toContain('bh-bubble-body-bot-mentions');
    expect(markup).toContain('data-bot-id="bea"');
    expect(markup).toContain('>Bea</span></button>');
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
      text: '**please check**',
    });
  });

  it('colors sent Bot mentions by PersonaBot ID and leaves Human and Group references neutral', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openBot = vi.fn(async () => undefined);
    const at = '2026-10-12T00:00:00.000Z';
    const bot = (slug: string, primaryColor?: { mode: 'custom'; color: string }) => ({
      slug,
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: at,
      ...(primaryColor === undefined ? {} : { primaryColor }),
    });
    const show = (ada: ReturnType<typeof bot>) =>
      act(async () => {
        root.render(
          createElement(ChannelMessageBody, {
            message: {
              id: 'm-colors',
              at,
              author: { kind: 'human' },
              body: '@Ada @Ada @Human #Team done',
              mentions: [
                { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
                { botSlug: 'bea', label: 'Ada', start: 5, end: 9 },
              ],
              humanMentions: [{ humanId: 'local-human', label: 'Human', start: 10, end: 16 }],
              channelRefs: [{ channelId: 'team', label: 'Team', start: 17, end: 22 }],
            },
            bots: [ada, bot('bea', { mode: 'custom', color: '#000000' })],
            t: zhTranslate,
            actions: { openBot } as unknown as BridgeActions,
          }),
        );
      });
    const name = (slug: string) =>
      container.querySelector<HTMLElement>(`[data-bot-id="${slug}"] > span:last-child`)!.dataset[
        'botNameColor'
      ]!;
    const contrast = (color: string, theme: 'light' | 'dark') =>
      contrastRatio(parseColor(color)!.rgb, parseColor(REFERENCE_SURFACES[theme].background)!.rgb);
    try {
      await show(bot('ada', { mode: 'custom', color: '#ffffff' }));
      expect(name('ada')).not.toBe('#ffffff');
      expect(contrast(name('ada'), 'light')).toBeGreaterThanOrEqual(4.5);
      expect(name('bea')).toBe('#000000');
      const neutral = container.querySelectorAll<HTMLElement>(
        '.bh-inline-mention:not([data-bot-id])',
      );
      expect(neutral).toHaveLength(2);
      for (const item of neutral) {
        expect(item.dataset['botNameColor']).toBeUndefined();
        expect(item.style.color).toBe('');
      }
      for (const chip of container.querySelectorAll<HTMLElement>('[data-bot-id]'))
        expect(chip.style.color).toBe('');

      document.body.setAttribute('data-ds-dark-theme', '');
      await act(async () => new Promise((done) => setTimeout(done, 0)));
      expect(name('ada')).toBe('#ffffff');
      expect(name('bea')).not.toBe('#000000');
      expect(contrast(name('bea'), 'dark')).toBeGreaterThanOrEqual(4.5);
      document.body.removeAttribute('data-ds-dark-theme');
      await act(async () => new Promise((done) => setTimeout(done, 0)));

      await show(bot('ada'));
      expect(name('ada')).toBe(
        botNameColor(seededAvatarFor('Ada', undefined).hairColor, '#ffffff'),
      );
      expect(name('bea')).toBe('#000000');

      await act(async () =>
        container.querySelector<HTMLButtonElement>('button[data-bot-id="bea"]')!.click(),
      );
      expect(openBot).toHaveBeenCalledExactlyOnceWith('bea');
    } finally {
      document.body.removeAttribute('data-ds-dark-theme');
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows mixed Bot/Human targets without turning the Human into a Bot DM link', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'mixed',
          at: '2026-09-30T00:00:00Z',
          author: { kind: 'bot', slug: 'ada' },
          body: '@Bea @Human **please confirm**',
          mentions: [{ botSlug: 'bea', label: 'Bea', start: 0, end: 4 }],
          humanMentions: [{ humanId: 'local-human', label: 'Human', start: 5, end: 11 }],
        },
        t: zhTranslate,
        actions: { openBot: vi.fn() } as unknown as BridgeActions,
      }),
    );
    expect(markup).toContain('data-human-id="local-human"');
    expect(markup).toContain('@Human</span>');
    expect(markup).not.toContain('data-bot-id="local-human"');
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
      text: '**please confirm**',
    });
  });

  it('opens the selected Bot DM by stable ID even when display names are identical', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openBot = vi.fn(async () => undefined);
    try {
      await act(async () => {
        root.render(
          createElement(ChannelMessageBody, {
            message: {
              id: 'm-duplicates',
              at: '2026-09-25T00:00:00.000Z',
              author: { kind: 'human' },
              body: '@Ada @Ada @Plain',
              mentions: [
                { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
                { botSlug: 'bea', label: 'Ada', start: 5, end: 9 },
              ],
            },
            t: zhTranslate,
            actions: { openBot } as unknown as BridgeActions,
          }),
        );
      });
      const links = container.querySelectorAll('button.bh-inline-mention-link');
      expect(links).toHaveLength(2);
      expect(container.textContent).toContain('@Plain');
      await act(async () => (links[1] as HTMLButtonElement).click());
      expect(openBot).toHaveBeenCalledExactlyOnceWith('bea');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('uses a compact localized failure row with a settings action and collapsed raw detail', () => {
    const markup = render({ kind: 'bot', slug: 'ada' }, 'Session failed', {
      sessionFailure: {
        role: 'orchestrator',
        sessionId: 'session-auth',
        code: 'AUTH',
        status: 401,
        detail: 'Authentication Fails (request_id: test-123)',
      },
    });
    expect(markup).toContain('API 密钥无效');
    expect(markup).toContain('打开模型设置');
    expect(markup).toContain('data-state-dot="error"');
    expect(markup).toContain('<details');
    expect(markup).toContain('Authentication Fails (request_id: test-123)');
    expect(markup).not.toContain('bh-session-failure-card');
  });

  it('uses the pinned native chat locale for the failure title and AUTH copy', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'm-native',
          at: '2026-09-19T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Session failed',
          sessionFailure: {
            role: 'orchestrator',
            sessionId: 'session-auth',
            code: 'AUTH',
            detail: 'raw error',
          },
        },
        t: zhTranslate,
        nativeChatT: (key: string) =>
          key === 'message.turnError' ? 'Native turn failure' : 'Native invalid key',
      }),
    );
    expect(markup).toContain('Native turn failure');
    expect(markup).toContain('Native invalid key');
  });

  it.each([
    ['MISSING_CREDENTIAL', '尚未设置 API 密钥', true],
    ['INVALID_CREDENTIAL', 'API 密钥配置无效', true],
    ['QUOTA', 'API 余额不足', true],
    ['RATE_LIMIT', '请求过于频繁', false],
    ['TRANSPORT', '连接模型服务失败', false],
    ['TIMEOUT', '模型服务响应超时', false],
    ['SERVER', '模型服务暂时不可用', false],
  ])('explains %s without making the raw provider message primary', (code, summary, actionable) => {
    const markup = render({ kind: 'bot', slug: 'ada' }, 'Session failed', {
      sessionFailure: {
        role: 'assignment',
        sessionId: 'session-other',
        code,
        detail: 'Raw provider diagnostic',
        context: 'Read project',
      },
    });
    expect(markup).toContain(summary);
    expect(markup).toContain('Read project');
    expect(markup).toContain('<details');
    expect(markup).toContain('Raw provider diagnostic');
    expect(markup.includes('打开模型设置')).toBe(actionable);
  });

  it('renders server-sniffed images inline and files as downloads', () => {
    const hash = `sha256:${'a'.repeat(64)}`;
    const markup = render({ kind: 'human' }, '', {
      attachments: [
        { hash, name: 'photo.png', mime: 'image/png', size: 123 },
        { hash, name: 'report.pdf', mime: 'application/pdf', size: 456 },
      ],
    });
    expect(markup).toContain('<img');
    expect(markup).toContain('alt="photo.png"');
    expect(markup).toContain('download="report.pdf"');
    expect(markup).toContain('data-file-type-icon="report.pdf"');
    expect(markup).toContain('class="bh-message-file-name" title="report.pdf"');
    expect(markup).not.toContain('▤');
    expect(markup).toContain('/api/botharness/attachment?hash=');
    expect(markup).toContain('channelId=channel-owner');
    expect(markup).toContain('messageId=m1');
  });

  it('does not emit an unowned legacy attachment URL when channel context is absent', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'unowned',
          at: '2026-09-19T00:00:00.000Z',
          author: { kind: 'human' },
          body: '',
          attachments: [
            { hash: `sha256:${'a'.repeat(64)}`, name: 'photo.png', mime: 'image/png', size: 123 },
            {
              hash: `sha256:${'b'.repeat(64)}`,
              name: 'report.pdf',
              mime: 'application/pdf',
              size: 456,
            },
          ],
        },
        t: zhTranslate,
      }),
    );
    expect(markup).toContain('photo.png');
    expect(markup).toContain('report.pdf');
    expect(markup).not.toContain('/api/botharness/attachment?');
  });

  it('routes Bot and bridged messages to the public DSH Markdown renderer', () => {
    for (const author of [
      { kind: 'bot', slug: 'ada' },
      { kind: 'bridged', source: 'lark' },
    ] as const) {
      expect(render(author, '## Report')).toContain('bh-bubble-body-markdown');
      expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
        text: '## Report',
        streaming: false,
      });
      vi.mocked(MarkdownText).mockClear();
    }
  });

  it('keeps casual Human punctuation, whitespace and newlines literal', () => {
    const markup = render({ kind: 'human' }, '#1 is 2*3\n_maybe_  ');
    expect(markup).toContain('#1 is 2*3\n_maybe_  ');
    expect(markup).not.toContain('bh-bubble-body-markdown');
    expect(MarkdownText).not.toHaveBeenCalled();
  });

  it('renders Human Markdown and keeps the line breaks the Human typed', () => {
    const markup = render({ kind: 'human' }, 'plan\n- **ship** it\n- run `pnpm test`');
    expect(markup).toContain('bh-bubble-body-markdown');
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
      text: 'plan  \n- **ship** it  \n- run `pnpm test`',
    });
  });

  it('honors an explicit text override for Bot messages', () => {
    expect(render({ kind: 'bot', slug: 'ada' }, '**literal**', { format: 'text' })).toContain(
      '**literal**',
    );
    expect(MarkdownText).not.toHaveBeenCalled();
  });

  it('passes streaming state and localized labels without enabling file extensions', () => {
    render({ kind: 'bot', slug: 'ada' }, 'partial', { streaming: true });
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
      text: 'partial',
      streaming: true,
      labels: { code: { copyLabel: '复制代码', copiedLabel: '已复制' }, footnotes: '脚注' },
    });
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0].fileMentions).toBeUndefined();
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0].pathImages).toBeUndefined();
  });
});

describe('Tool approval card', () => {
  it('keeps an accepted decision visible while capacity is unavailable, then clears the wait on execution', async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const toolApprovalExecutionState = vi
      .fn()
      .mockResolvedValueOnce('waiting-capacity')
      .mockResolvedValueOnce('running');
    const actions = { toolApprovalExecutionState } as unknown as BridgeActions;
    const message: ChannelMessage = {
      id: 'approval-capacity',
      at: '2026-10-09T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve bash',
      toolApprovalRequest: {
        sessionId: 'original',
        callId: 'call',
        role: 'assignment',
        toolName: 'bash',
        cwd: '/qa',
        input: '{}',
      },
    };
    try {
      await act(async () =>
        root.render(
          createElement(ChannelMessageBody, {
            message,
            actions,
            t: zhTranslate,
            toolApprovalDecision: 'allowed-once',
          }),
        ),
      );
      expect(container.textContent).toContain('终端 · 已允许');
      expect(container.textContent).toContain('等待运行名额');
      expect(container.textContent).not.toContain('仅批准这一次');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(container.textContent).not.toContain('等待运行名额');
      expect(container.textContent).toContain('终端 · 已允许');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(toolApprovalExecutionState).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it('removes approval actions immediately when a Workspace Grant change expires the request', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const toolApprovalStatus = vi
      .fn()
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('expired');
    const message: ChannelMessage = {
      id: 'approval-1',
      at: '2026-09-25T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve bash',
      toolApprovalRequest: {
        sessionId: 'assignment-1',
        callId: 'call-1',
        toolName: 'bash',
        role: 'assignment',
        cwd: '/tmp/project',
        input: '{"command":"pwd"}',
      },
    };
    try {
      await act(async () => {
        root.render(
          createElement(ChannelMessageBody, {
            message,
            t: zhTranslate,
            actions: { toolApprovalStatus } as unknown as BridgeActions,
          }),
        );
      });
      expect(container.textContent).toContain('仅批准这一次');
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug: 'ada' } }),
        );
      });
      expect(toolApprovalStatus).toHaveBeenCalledTimes(2);
      expect(container.textContent).not.toContain('仅批准这一次');
      expect(container.textContent).toContain('终端 · 已过期');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

it('renders current names for historical typed IDs without changing plain text or saved offsets', () => {
  const message: ChannelMessage = {
    id: 'history',
    at: '2026-10-01T00:00:00Z',
    author: { kind: 'bot', slug: 'ada' },
    format: 'text',
    body: '@Ada @Human / plain @Ada @Human',
    mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    humanMentions: [{ humanId: 'local-human', label: 'Human', start: 5, end: 11 }],
  };
  const original = JSON.stringify(message);
  const html = renderToStaticMarkup(
    createElement(ChannelMessageBody, {
      message,
      t: zhTranslate,
      bots: [
        {
          slug: 'ada',
          displayName: '教授 🐻',
          roles: [],
          aggregateState: 'idle',
          workspaces: [],
          createdAt: '',
        },
      ],
      humanMembers: [{ humanId: 'local-human', displayName: '教授 🐻' }],
    }),
  );
  expect(html).toContain('data-human-id="local-human"');
  expect(html).toContain('@教授 🐻');
  expect(html).toContain('data-bot-id="ada"');
  expect(html).toContain('plain @Ada @Human');
  expect(JSON.stringify(message)).toBe(original);
  const fallback = renderToStaticMarkup(
    createElement(ChannelMessageBody, { message, t: zhTranslate }),
  );
  expect(fallback).toContain('@Human');
  expect(fallback).toContain('Ada');
});

it('renders a purged welcome as a tombstone before considering onboarding actions', () => {
  const html = renderToStaticMarkup(
    createElement(ChannelMessageBody, {
      message: {
        id: 'welcome-purged',
        at: '2026-10-08T00:00:00Z',
        author: { kind: 'system' },
        body: '',
        onboardingWelcome: { version: 1 },
        contentPurged: true,
      },
      channelId: 'dm-ada',
      actions: {} as BridgeActions,
      t: zhTranslate,
    }),
  );
  expect(html).toContain(zhTranslate('purge.purged'));
  expect(html).not.toContain('data-onboarding-welcome');
  expect(html).not.toContain('<button');
});

describe('Tool approval text follows the UI locale (#1293)', () => {
  const enTranslate: BotHarnessTranslate = (key, params) => {
    const value: unknown = Reflect.get(en, key);
    const text = typeof value === 'string' ? value : key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
  };
  const request: ChannelMessage = {
    id: 'approval',
    at: '2026-10-09T00:00:00.000Z',
    author: { kind: 'bot', slug: 'ada' },
    body: '请求批准执行 bash',
    toolApprovalRequest: {
      sessionId: 's1',
      callId: 'c1',
      toolName: 'bash',
      role: 'orchestrator',
      cwd: '/work',
      input: '{}',
      externalDecision: 'operation',
    },
  } as ChannelMessage;
  const decision = (outcome: NonNullable<ChannelMessage['toolApprovalDecision']>['outcome']) =>
    ({
      id: 'decision-' + outcome,
      at: '2026-10-09T00:00:01.000Z',
      author: { kind: 'human' },
      body: '已拒绝这一次工具调用',
      replyTo: 'approval',
      toolApprovalDecision: { requestMessageId: 'approval', outcome },
    }) as ChannelMessage;

  it('derives request and decision text from structured fields, not the stored body', () => {
    expect(toolApprovalText(request, enTranslate)).toBe('Requests approval to run bash');
    expect(toolApprovalText(decision('rejected'), enTranslate)).toBe('This call was rejected');
    expect(toolApprovalText(decision('allowed-once'), enTranslate)).toBe('This call was approved');
    expect(toolApprovalText(decision('allowed-always-all'), enTranslate)).toBe(
      'Automatic approval rule saved; this call was approved',
    );
    expect(toolApprovalText(decision('rejected'), zhTranslate)).toBe('已拒绝这一次调用');
    expect(toolApprovalText({}, enTranslate)).toBeUndefined();
  });

  it('renders a decision bubble in English without the Host body', () => {
    const html = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: decision('rejected'),
        channelId: 'dm-ada',
        t: enTranslate,
      }),
    );
    expect(html).toContain('This call was rejected');
    expect(html).not.toMatch(/[\u4e00-\u9fff]/u);
  });
});

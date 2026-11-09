// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  const CopyArtwork = ({ size = 16 }: { size?: number }) =>
    createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        strokeWidth: 1,
      },
      createElement('rect', {
        x: '1.52075',
        y: '4.07373',
        width: '10.3932',
        height: '10.3932',
        rx: '2',
        stroke: 'currentColor',
      }),
      createElement('path', {
        d: 'M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z',
        fill: 'currentColor',
      }),
    );
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: CopyArtwork,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: stub,
    Menu: stub,
    MenuItemButton: stub,
    MarkdownText: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';
import { CSS } from '../src/client/styles.js';

const NARROW_BLOCK = `/* Narrow screens: inline copy/reply actions crowd the bubble, so they move
   into the long-press message menu and the bubble keeps the full width. */
@media (max-width: 640px) {
  .bh-bubble-toolbar {
    display: none;
  }
}`;

const DSW_DARK = {
  '--dsw-alias-interactive-bg-active': '#ffffff24',
  '--dsw-alias-interactive-bg-hover': '#ffffff14',
  '--dsw-alias-label-primary': '#f9fafb',
  '--dsw-alias-label-secondary': '#cfd3d6',
  '--dsw-alias-label-tertiary': '#adb2b8',
  '--dsw-alias-label-dimmed': '#43454a',
  '--dsw-alias-label-primary-foreground': '#0f1115',
  '--dsw-alias-border-l2': '#ffffff1f',
  '--dsw-alias-border-l3': '#ffffff29',
  '--dsw-alias-bg-base': '#151517',
  '--dsw-alias-bg-module-platform': '#353638',
  '--dsw-alias-state-error-primary': '#f25a5a',
  '--dsw-alias-state-business-primary': '#7aaaff',
  '--dsw-alias-button-elevated-fill': '#43454a',
} as const;

function page(chatBody: string, css: string, title: string): string {
  const vars = Object.entries(DSW_DARK)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=390, initial-scale=1" />
<title>${title}</title>
<style>
:root {
${vars}
}
html, body { margin: 0; padding: 0; background: #151517; color: #f9fafb; }
.bh-shot-column { width: 390px; height: 844px; overflow: hidden; position: relative; }
.bh-shot-column .bh-chat-body { height: 844px; padding: 12px 12px 10px; box-sizing: border-box; }
</style>
<style>
${css}
</style>
</head>
<body>
<div class="bh-shot-column">
<div class="bh-root bh-main">
${chatBody}
</div>
</div>
<script>
var body = document.querySelector('.bh-chat-body');
if (body) body.scrollTop = body.scrollHeight;
</script>
</body>
</html>`;
}

describe.skipIf(!process.env.BH_NARROW_SHOTS)('narrow bubble evidence', () => {
  it('writes before/after 390px pages with production markup and CSS', async () => {
    if (!CSS.includes(NARROW_BLOCK)) throw new Error('narrow CSS block missing from styles');
    const beforeCss = CSS.replace(NARROW_BLOCK, '');
    expect(beforeCss.length).toBeLessThan(CSS.length);

    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-10T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:01:00.000Z',
    };
    const previous = store.getSnapshot();
    const registry = createChannelSidebarRegistry();
    for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
    const actions = {
      markRead: async () => undefined,
      modelPlanState: async () => undefined,
      botSourcePolicies: async () => [],
    } as unknown as BridgeActions;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      store.setRoster([bot], [channel]);
      store.select({ kind: 'bot', slug: 'ada' });
      store.setConversation({
        status: 'ready',
        channel,
        sending: false,
        messages: [
          {
            id: 'human-1',
            at: '2026-10-10T00:01:00.000Z',
            author: { kind: 'human' },
            body: '请介绍一下你能帮我做什么',
            format: 'text',
          },
          {
            id: 'bot-1',
            at: '2026-10-10T00:02:00.000Z',
            author: { kind: 'bot', slug: 'ada' },
            body: '我可以帮你规划今天的工作，比如整理待办、跟进群聊消息，以及每天晚上 9 点来和你打个招呼。',
            format: 'text',
          },
        ],
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      await act(async () => {
        root.render(createElement(BotMain, { actions, channelSidebar: registry, t: zhTranslate }));
      });
      const chatBody = host.querySelector('.bh-chat-body');
      if (chatBody === null) throw new Error('chat body did not render');
      expect(chatBody.querySelectorAll('[data-message-id]').length).toBe(2);
      expect(chatBody.querySelectorAll('[data-bubble-action]').length).toBeGreaterThan(0);
      const markup = chatBody.outerHTML;
      mkdirSync('/tmp/bh-shots', { recursive: true });
      writeFileSync('/tmp/bh-shots/narrow-before.html', page(markup, beforeCss, 'before'));
      writeFileSync('/tmp/bh-shots/narrow-after.html', page(markup, CSS, 'after'));
    } finally {
      await act(async () => root.unmount());
      host.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
    }
  });
});

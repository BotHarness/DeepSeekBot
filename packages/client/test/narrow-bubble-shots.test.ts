// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;

  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),

    IconCloseFill14: stub,

    FileTypeIcon: stub,
    ImageLightbox: stub,

    MarkdownText: stub,

    StateDot: stub,

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
import { tobsTokens } from '../src/client/tobs-theme.js';

const NARROW_BLOCK = `/* Narrow screens: inline copy/reply actions crowd the bubble, so they move
   into the long-press message menu and the bubble keeps the full width. */
@media (max-width: 640px) {
  .bh-bubble-toolbar {
    display: none;
  }
}`;

function page(chatBody: string, css: string, title: string): string {
  const vars = Object.entries(tobsTokens('dark', 'classic-blue'))
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
html, body { margin: 0; padding: 0; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); }
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

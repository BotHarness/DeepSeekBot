import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({ children, ...props }: ComponentProps<'button'>) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));

import { createActions } from '../src/client/actions.js';
import { HumanInboxView, type HumanInboxSource } from '../src/client/human-inbox-view.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';
import { CSS } from '../src/client/styles.js';
import { space, text } from '../src/client/ds/tokens.stylex.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';

const require = createRequire(import.meta.url);
const puppeteer = createRequire(require.resolve('@mermaid-js/mermaid-cli'))('puppeteer');
let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
afterAll(async () => {
  await browser?.close();
}, 30_000);

const actions = createActions(async () => ({ ok: true, value: { items: [] } }), store);
const source: HumanInboxSource = {
  commands: actions,
  detail: () => createElement('div'),
  botName: () => 'Remote Bot',
  isDirect: () => false,
  open: async () => {},
  sourceButton: (_item, onClick) => createElement('button', { onClick }, '#'),
  refresh: async () => {},
  loadMore: async () => {},
};
const english: BotHarnessTranslate = (key, params) =>
  Object.entries(params ?? {}).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    en[key],
  );

describe.each([
  { owner: 'local', language: 'zh', t: zhTranslate },
  { owner: 'remote', language: 'zh', t: zhTranslate },
  { owner: 'local', language: 'en', t: english },
  { owner: 'remote', language: 'en', t: english },
])('$owner $language Activity row layout', ({ owner, language, t }) => {
  it.each([229.328125, 320, 720, 1120])(
    'keeps summaries readable and every action within a %s-wide container',
    async (width) => {
      const item: HumanAttentionItem = {
        id: 'mention',
        kind: 'channel-mention',
        category: 'replies',
        botSlug: 'ada',
        channelId: 'group',
        channelName: '讨论一个需要确认的方案 · A conversation with a long English name',
        summary: '请检查这条较长的消息并回复。Please review this long message before proceeding.',
        createdAt: '2026-10-22T00:00:00Z',
        messageId: 'message',
        isUnread: true,
      };
      const markup = renderToStaticMarkup(
        createElement(HumanInboxView, {
          ...(owner === 'local' ? { actions } : { hostSource: source }),
          inboxOverride: {
            ...store.getSnapshot().humanInbox,
            status: 'ready',
            category: 'replies',
            items: [item],
            error: t('humanInbox.failed'),
          },
          t,
        }),
      );
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1440, height: 1000 });
        await page.setContent(`<style>${CSS}
          body { margin: 0; font: ${text.bodySize}/${text.bodyLine} Arial; }
          button { font: inherit; white-space: nowrap; padding: ${space.x2} ${space.x3}; }
        </style><div class="bh-activity-triage bh-activity-center-panel" style="width:${width}px"><div class="bh-activity-sections">${markup}</div></div>`);
        const measured = await page.evaluate(() => {
          const row = document.querySelector<HTMLElement>('.bh-human-inbox-row')!;
          const main = row
            .querySelector<HTMLElement>('.bh-human-inbox-row-main')!
            .getBoundingClientRect();
          const area = row
            .querySelector<HTMLElement>('.bh-human-inbox-row-actions')!
            .getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          const buttons = [
            ...row.querySelectorAll<HTMLElement>('.bh-human-inbox-row-actions button'),
          ];
          return {
            summaryWidth: main.width,
            rowWidth: bounds.width,
            rowHeight: bounds.height,
            stacked: area.top >= main.bottom,
            actions: buttons.map((button) => {
              const box = button.getBoundingClientRect();
              return box.width > 0 && box.left >= bounds.left && box.right <= bounds.right;
            }),
          };
        });
        if (process.env['BH_LAYOUT_EVIDENCE'])
          appendFileSync(
            process.env['BH_LAYOUT_EVIDENCE'],
            JSON.stringify({ owner, language, width, ...measured }) + '\n',
          );
        expect(measured.summaryWidth).toBeGreaterThanOrEqual(Math.min(160, width / 2));
        expect(measured.rowWidth).toBeLessThanOrEqual(width);
        expect(measured.actions.length).toBeGreaterThanOrEqual(owner === 'local' ? 3 : 4);
        expect(measured.actions.every(Boolean)).toBe(true);
        if (width <= 320) expect(measured.stacked).toBe(true);
        if (width >= 1000) expect(measured.stacked).toBe(false);
        const card = renderToStaticMarkup(
          createElement(ToolApprovalCard, {
            message: {
              id: 'request',
              at: item.createdAt,
              author: { kind: 'bot', slug: 'ada' },
              body: '',
              attachments: [],
              toolApprovalRequest: {
                sessionId: 'session',
                callId: 'call',
                toolName: 'bash',
                role: 'orchestrator',
                cwd: '/qa',
                input: '{"command":"echo layout"}',
              },
            },
            actions,
            t,
            hostScoped: owner === 'remote',
          }),
        );
        await page.evaluate((markup: string) => {
          const detail = document.createElement('div');
          detail.className = 'bh-human-inbox-detail';
          detail.innerHTML = markup;
          document.querySelector('.bh-human-inbox-row')!.append(detail);
        }, card);
        const detail = await page.evaluate(() => {
          const row = document.querySelector<HTMLElement>('.bh-human-inbox-row')!;
          const box = row.querySelector('.bh-human-inbox-detail')!.getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          const style = getComputedStyle(row);
          return {
            width: box.width,
            available:
              bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            below:
              box.top >=
              row.querySelector('.bh-human-inbox-row-actions')!.getBoundingClientRect().bottom,
          };
        });
        expect(detail.width).toBeCloseTo(detail.available, 0);
        expect(detail.below).toBe(true);
      } finally {
        await page.close();
      }
    },
  );
});

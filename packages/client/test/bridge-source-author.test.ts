// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({
    open,
    title,
    children,
    onClose,
  }: PropsWithChildren<{ open: boolean; title: string; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children,
          createElement('button', { onClick: onClose }, 'Close'),
        )
      : null,
}));
import { BridgeSourceAuthor } from '../src/client/bridge-source-author.js';
import { zhTranslate } from '../src/client/locale.js';

it('distinguishes two QQ applications in one Channel and exposes their receiving accounts without interpreting markup', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          ...['QA <img>', 'QA 2'].map((accountName, index) =>
            createElement(BridgeSourceAuthor, {
              key: accountName,
              origin: {
                platform: 'qq',
                accountName,
                accountRef: `qq-${index}`,
                conversationName: 'Same group',
                conversationId: `group-${index}`,
                sourceEventId: `source-${index}`,
                senderId: 'member',
                senderName: 'Member',
                messageId: `message-${index}`,
              },
              t: zhTranslate,
            }),
          ),
        ),
      ),
    );
    const authors = [...container.querySelectorAll('button')];
    expect(authors.map((button) => button.textContent)).toEqual([
      'Member · 【QQ · QA <img> · Same group】',
      'Member · 【QQ · QA 2 · Same group】',
    ]);
    expect(container.querySelector('img')).toBeNull();
    await act(async () => authors[1]!.click());
    const values = [...container.querySelectorAll('[role=dialog] dd')].map(
      (value) => value.textContent,
    );
    expect(values).toContain('QA 2');
    expect(values).toContain('qq-1');
    expect(values).not.toContain('qq-0');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('opens only the selected source details, restores compact presentation on close, and supports a thread', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(BridgeSourceAuthor, {
          origin: {
            platform: 'feishu',
            conversationName: 'QA <group>',
            conversationId: 'conversation',
            sourceEventId: 'canonical-source',
            senderId: 'sender',
            messageId: 'message',
            threadId: 'thread',
          },
          t: zhTranslate,
        }),
      ),
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('sender · 【Lark/飞书 QA <group>】');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(container.querySelector('[role=dialog]')).toBeNull();
    await act(async () => button.click());
    const dialog = container.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-label')).toBe('来源详情');
    expect([...dialog.querySelectorAll('dd')].map((e) => e.textContent)).toEqual([
      'Lark/飞书',
      'QA <group>',
      'conversation',
      'sender',
      'message',
      'canonical-source',
      'thread',
    ]);
    expect(dialog.querySelector('group')).toBeNull();
    await act(async () => dialog.querySelector('button')!.click());
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(container.textContent).toBe('sender · 【Lark/飞书 QA <group>】');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['discord', 'feishu'])(
  'shows %s sender names while keeping IDs in source details',
  async (platform) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(BridgeSourceAuthor, {
            origin: {
              platform,
              conversationName: 'QA',
              conversationId: 'conversation',
              sourceEventId: 'canonical-source',
              senderId: '552307579322236939',
              senderName: 'DoodleBear <img>',
              messageId: 'message',
            },
            t: zhTranslate,
          }),
        ),
      );
      const author = container.querySelector('button')!;
      expect(author.textContent).toBe(
        `DoodleBear <img> · 【${platform === 'discord' ? 'Discord' : 'Lark/飞书'} QA】`,
      );
      expect(author.getAttribute('aria-label')).toContain('DoodleBear <img>');
      expect(container.querySelector('img')).toBeNull();
      await act(async () => author.click());
      const dialog = container.querySelector('[role=dialog]')!;
      expect([...dialog.querySelectorAll('dd')].map((entry) => entry.textContent)).toEqual([
        platform === 'discord' ? 'Discord' : 'Lark/飞书',
        'QA',
        'conversation',
        'DoodleBear <img>',
        '552307579322236939',
        'message',
        'canonical-source',
      ]);
      expect(dialog.querySelector('img')).toBeNull();
      await act(async () => dialog.querySelector('button')!.click());
      expect(container.querySelector('[role=dialog]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);

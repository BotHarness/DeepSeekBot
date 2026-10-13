// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Modal: ({ open, children, footer }: PropsWithChildren<{ open: boolean; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog' }, children, footer) : null,
}));
import { ReachablePostDialog } from '../src/client/reachable-post.js';
import { zhTranslate } from '../src/client/locale.js';
import { chooseOption } from './primitive-mocks.js';

it.each([
  ['unknown-outcome', '结果未知', true],
  ['grant-revoked', '此会话已屏蔽或授权已撤销，本次未发送。', false],
  ['transport-failed', '未取得发送结果，请保留本次请求并核对 Outbox。', false],
] as const)(
  'Profile distinguishes %s while preserving the original request',
  async (outcome, message, disabled) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const posts: string[] = [];
    const requests: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(ReachablePostDialog, {
            slug: 'ada',
            recoveryScope: 'qa-test-owner',
            identity: {
              id: crypto.randomUUID(),
              botSlug: 'ada',
              providerId: 'dsh-im/feishu',
              platform: 'feishu',
              accountRef: 'qa',
              fingerprint: 'a'.repeat(64),
              name: 'QA app',
              enabled: true,
              revision: 1,
              newConversations: 'auto',
              createdAt: '2026-10-09T00:00:00Z',
              availability: 'available',
              grantCount: 0,
              scopes: [],
            },
            t: zhTranslate,
            onClose: () => {},
            refresh: async () => {},
            actions: {
              messagingReachable: async () => ({
                version: 1 as const,
                conversations: [{ id: 'oc_new', kind: 'group' as const, name: 'New QA group' }],
                hasMore: false,
              }),
              messagingPostConversation: async (_slug, _binding, _group, request, text) => {
                posts.push(text);
                requests.push(request);
                if (outcome === 'grant-revoked')
                  throw Object.assign(new Error('Refused'), { code: outcome });
                if (outcome === 'transport-failed') throw new Error('Connection interrupted');
                return {
                  id: 'intent',
                  botSlug: 'ada',
                  grantId: 'grant',
                  grantRevision: 1,
                  text,
                  state: 'unknown-outcome',
                  createdAt: '2026-10-09T00:00:00Z',
                };
              },
              messagingPostLimit: async () => {},
            },
          }),
        ),
      );

      await chooseOption('选择群聊', 'oc_new', host);
      const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )!.set!;
        setter.call(input, 'One report');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (value) => value.textContent === '主动发送',
      )!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(document.body.textContent).toContain(message);
      expect(button.disabled).toBe(disabled);
      await act(async () => button.click());
      expect(posts).toEqual(disabled ? ['One report'] : ['One report', 'One report']);
      expect(new Set(requests).size).toBe(outcome === 'grant-revoked' ? 2 : 1);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);

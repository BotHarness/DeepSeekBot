// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { HumanInboxReply } from '../src/client/human-inbox-reply.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { store } from '../src/client/store.js';

describe('Handled action navigation', () => {
  it.each(['question', 'approval'] as const)(
    'shows the settled %s outcome with a distant canonical response and an expired live broker',
    async (kind) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot();
      const requests: string[] = [];
      const request = {
        id: 'request',
        at: '2026-10-01T10:00:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Choose route',
        ...(kind === 'question'
          ? {
              userQuestionRequest: {
                sessionId: 'session',
                questions: [
                  { id: 'route', question: 'Choose route', options: [{ label: 'Stable' }] },
                ],
              },
            }
          : {
              toolApprovalRequest: {
                sessionId: 'session',
                callId: 'tool',
                toolName: 'bash',
                role: 'orchestrator',
                cwd: '/qa',
                input: '{"command":"echo ready"}',
              },
            }),
      };
      const answer = {
        id: 'answer',
        at: '2026-10-01T11:00:00Z',
        author: { kind: 'human' },
        body: 'Stable',
        replyTo: 'request',
        ...(kind === 'question'
          ? {
              userQuestionResolution: {
                requestMessageId: 'request',
                state: 'answered',
                answers: [{ id: 'route', selected: ['Stable'] }],
              },
            }
          : { toolApprovalDecision: { requestMessageId: 'request', outcome: 'rejected' } }),
      };
      const call: BridgeCall = async (endpoint, payload) => {
        if (endpoint === 'channelTimeline') {
          requests.push(String(payload['around']));
          return {
            ok: true,
            value: {
              revision: 40,
              page: {
                entries: [payload['around'] === 'answer' ? answer : request],
                hasOlder: false,
                hasNewer: false,
                olderCursor: null,
                newerCursor: null,
              },
            },
          };
        }
        if (endpoint === 'userQuestionStatus' || endpoint === 'toolApprovalStatus')
          return { ok: true, value: { status: 'expired' } };
        throw new Error('Unexpected ' + endpoint);
      };
      const source = {
        id: 'handled:request',
        category: 'handled' as const,
        kind: kind === 'question' ? ('user-question' as const) : ('tool-approval' as const),
        createdAt: answer.at,
        botSlug: 'ada',
        channelId: 'dm-ada',
        summary: 'Choose route',
        messageId: 'request',
        responseMessageId: 'answer',
        responseSourceEventId: 'answer-source',
      };
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(
            createElement(HumanInboxReply, {
              source,
              actions: createActions(call, store),
              t: zhTranslate,
              botName: () => 'Ada',
              bots: [],
              onClose: () => undefined,
            }),
          ),
        );
        expect(requests).toEqual(['request', 'answer']);
        expect(container.textContent).not.toContain(
          zhTranslate(kind === 'question' ? 'question.expired' : 'approval.expired'),
        );
        expect(container.textContent).toContain(
          zhTranslate(kind === 'question' ? 'question.answered' : 'approval.outcome.denied'),
        );
        expect(
          container.querySelector(
            kind === 'question' ? '.bh-question-card input' : '.bh-approval-card button',
          ),
        ).toBeNull();
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.select(previous.selection);
        store.setHumanInbox(previous.humanInbox);
      }
    },
  );
  it.each(['question', 'assignment'] as const)(
    'opens the exact %s source and canonical Human answer',
    async (kind) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot();
      const source = {
        id: 'handled:source',
        category: 'handled' as const,
        kind: kind === 'question' ? ('user-question' as const) : ('assignment-blocked' as const),
        createdAt: '2026-10-01T10:00:00Z',
        channelId: 'dm-ada',
        channelName: 'Ada',
        botSlug: 'ada',
        summary: 'Choose route',
        sourceEventId: 'source',
        responseMessageId: 'answer',
        responseSourceEventId: 'answer-source',
        ...(kind === 'question'
          ? { messageId: 'request' }
          : { assignmentSessionId: 'original-session' }),
      };
      const openBot = vi.fn(async () => undefined),
        openAround = vi.fn(async () => undefined);
      const openSession = vi.fn(),
        openChannelAtMessage = vi.fn(async () => undefined);
      const actions = {
        openBot,
        openAround,
        openSession,
        openChannelAtMessage,
        refreshHumanInbox: async () => undefined,
      } as unknown as BridgeActions;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const click = async (label: string) => {
        const button = [...container.querySelectorAll('button')].find(
          (node) =>
            node.textContent === label ||
            node.getAttribute('aria-label')?.startsWith(label + ' · '),
        );
        expect(button).toBeDefined();
        await act(async () => button!.click());
      };
      try {
        await act(async () => {
          store.select({ kind: 'inbox' });
          store.setHumanInbox({ category: 'handled', status: 'ready', items: [source] });
          root.render(createElement(HumanInboxView, { actions }));
        });
        await click(kind === 'assignment' ? '查看 Session' : '查看来源');
        expect(openBot).toHaveBeenCalledWith('ada');
        if (kind === 'question') expect(openAround).toHaveBeenCalledWith('dm-ada', 'request');
        else expect(openSession).toHaveBeenCalledWith('original-session');
        await click('查看答复');
        expect(openChannelAtMessage).toHaveBeenCalledWith('dm-ada', 'answer');
        openChannelAtMessage.mockRejectedValueOnce(new Error('Source unavailable'));
        await click('查看答复');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.select(previous.selection);
        store.setHumanInbox(previous.humanInbox);
      }
    },
  );
});

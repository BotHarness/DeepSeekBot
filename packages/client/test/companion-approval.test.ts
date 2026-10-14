// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanions } from '../src/client/window-companions.js';
import { WindowCompanionsView } from '../src/client/window-companions-view.js';
import { createActions } from '../src/client/actions.js';
import { store } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';
import type { ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Menu: () => null,
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
  Input: () => null,
  MarkdownText: () => null,
  StateDot: () => null,
}));

it.each([
  ['allowed-once', 2, false, false],
  ['rejected', 2, false, false],
  ['allowed-always-all', 2, false, false],
  ['rejected', 1, true, false],
  ['rejected', 2, true, true],
] as const)(
  'submits %s across pages with %i requests, decision before projection %s, and moved focus %s',
  async (outcome, requestCount, decisionBeforeProjection, movedFocus) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const old = store.getSnapshot();
    const events = new EventTarget();
    let revision = 0;
    const pending = new Set(['one', 'two'].slice(0, requestCount));
    let releaseDecision: (() => void) | undefined;
    const decisions: unknown[] = [];
    const call: BridgeCall = async (endpoint, payload) => {
      if (endpoint === 'toolApprovalStatus')
        return {
          ok: true,
          value: { status: pending.has(payload['messageId'] as string) ? 'pending' : 'expired' },
        };
      if (endpoint === 'toolApprovalDecide') {
        if (decisionBeforeProjection)
          await new Promise<void>((resolve) => {
            releaseDecision = resolve;
          });
        decisions.push(payload);
        pending.delete(payload['messageId'] as string);
        if (!decisionBeforeProjection) snapshot();
        return { ok: true, value: { accepted: true } };
      }
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount: 0, hasAction: true } };
      throw new Error(endpoint);
    };
    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'qa' }),
      source: () => ({
        readyState: 1,
        addEventListener: events.addEventListener.bind(events),
        close() {},
      }),
      update: async (value) => {
        revision = value.revision;
      },
    });
    const snapshot = () =>
      events.dispatchEvent(
        new MessageEvent('companion/selection', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'live',
            selectionRevision: revision,
            bots: [
              {
                slug: 'ada',
                name: 'Ada',
                paused: false,
                requests: [...pending].map((messageId) => ({
                  kind: 'tool-approval',
                  botSlug: 'ada',
                  channelId: 'dm-ada',
                  channelName: 'Ada',
                  messageId,
                  sessionId: 'owned-session',
                  callId: `call-${messageId}`,
                  toolName: 'bash',
                  role: 'assignment',
                  cwd: '/qa/release',
                  input: '{"command":"echo QA"}',
                  expiresAt: '2099-10-08T00:00:00Z',
                })),
              },
            ],
            activity: { generation: 'host', revision, bots: [] },
          }),
        }),
      );
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      store.select({ kind: 'channel', channelId: 'unrelated' });
      await companion.start();
      companion.select('ada');
      companion.configureCapacity({ layers: 1, retention: 1 });
      companion.get('ada')!.configure({ activity: false, dm: false, group: false });
      events.dispatchEvent(
        new MessageEvent('companion/baseline', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'live',
            bots: [],
            activity: { generation: 'host', revision: 0, bots: [] },
          }),
        }),
      );
      await Promise.resolve();
      snapshot();
      await act(async () =>
        root.render(
          createElement(WindowCompanionsView, {
            companion,
            actions: createActions(call, store),
            t: zhTranslate,
            openDm() {},
            openAttention() {},
            openChannel() {},
          }),
        ),
      );
      expect(node.querySelectorAll('.bh-companion-pending li')).toHaveLength(1);
      expect(node.querySelector('.bh-companion-bubble')).toBeNull();
      expect(node.textContent).not.toContain('/qa/release');
      if (requestCount > 1) expect(node.textContent).toContain('1/2');
      expect(node.querySelector('.bh-request-summary')?.getAttribute('aria-expanded')).toBe(
        'false',
      );
      expect(node.querySelector('.bh-companion-details')).toBeNull();
      await act(() => companion.get('ada')!.advance(30_000));
      expect(node.querySelectorAll('.bh-companion-pending li')).toHaveLength(1);
      await act(() => events.dispatchEvent(new Event('error')));
      expect(
        [
          ...node.querySelectorAll<HTMLButtonElement>(
            '.bh-tool-approval-card .bh-tool-approval-actions button',
          ),
        ].every((button) => button.disabled),
      ).toBe(true);
      expect(decisions).toEqual([]);
      await act(async () => {
        events.dispatchEvent(
          new MessageEvent('companion/baseline', {
            data: JSON.stringify({
              profileId: 'qa',
              consumerId: 'live',
              bots: [],
              activity: { generation: 'host', revision: 0, bots: [] },
            }),
          }),
        );
        await Promise.resolve();
        snapshot();
      });
      const button = (label: string) =>
        [...node.querySelectorAll<HTMLButtonElement>('.bh-tool-approval-card button')].find(
          (b) => b.textContent === label,
        )!;
      button(outcome === 'rejected' ? '拒绝' : '仅批准这一次').focus();
      if (outcome === 'allowed-always-all') {
        await act(() => button('始终允许此范围全部不透明工具').click());
        expect(decisions).toEqual([]);
        button('确认始终允许').focus();
        await act(async () => button('确认始终允许').click());
      } else
        await act(async () => button(outcome === 'rejected' ? '拒绝' : '仅批准这一次').click());
      if (decisionBeforeProjection) {
        expect(button('拒绝').disabled).toBe(true);
        button('拒绝').blur();
        if (movedFocus) node.querySelector<HTMLButtonElement>('.bh-companion-character')!.focus();
        await act(async () => releaseDecision!());
        if (!movedFocus) expect(document.activeElement).toBe(document.body);
        await act(() => snapshot());
      }
      expect(decisions).toEqual([{ channelId: 'dm-ada', messageId: 'one', outcome }]);
      expect(store.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'unrelated' });
      expect(node.querySelectorAll('.bh-companion-pending li')).toHaveLength(requestCount - 1);
      expect(node.textContent).not.toContain('1/2');
      if (requestCount === 1 || movedFocus)
        expect(document.activeElement).toBe(node.querySelector('.bh-companion-character'));
      else
        expect(node.querySelector('.bh-companion-pending')?.contains(document.activeElement)).toBe(
          true,
        );
      await act(() => companion.remove('ada'));
      expect(decisions).toHaveLength(1);
    } finally {
      await act(() => root.unmount());
      companion.dispose();
      node.remove();
      store.select(old.selection);
      store.setHumanInbox(old.humanInbox);
      vi.unstubAllGlobals();
    }
  },
);

it.each(['native', 'wrong-target', 'unmounted'] as const)(
  'does not bypass ownership or lifecycle when the approval context is %s',
  async (context) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const old = store.getSnapshot();
    let release: (() => void) | undefined;
    let checks = 0;
    const decide = vi.fn();
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'toolApprovalStatus') {
        if (++checks === 2 && context === 'unmounted')
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return { ok: true, value: { status: 'pending' } };
      }
      decide();
      return { ok: true, value: { accepted: true } };
    };
    const message: ChannelMessage = {
      id: 'request',
      at: '2026-10-08T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      toolApprovalRequest: {
        sessionId: 'owned',
        callId: 'call',
        toolName: 'bash',
        role: 'orchestrator',
        cwd: '/qa',
        input: '{}',
      },
    };
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    let unmounted = false;
    try {
      store.select({ kind: 'channel', channelId: 'unrelated' });
      await act(async () =>
        root.render(
          createElement(ToolApprovalCard, {
            message,
            actions: createActions(call, store),
            t: zhTranslate,
            ...(context === 'native'
              ? {}
              : {
                  companionTarget: {
                    channelId: 'dm-ada',
                    botSlug: 'ada',
                    sessionId: context === 'wrong-target' ? 'other-session' : 'owned',
                    callId: 'call',
                    live: true,
                  },
                }),
          }),
        ),
      );
      const button = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === '仅批准这一次',
      )!;
      await act(async () => button.click());
      if (context === 'unmounted') {
        expect(release).toBeTypeOf('function');
        await act(() => root.unmount());
        unmounted = true;
        await act(async () => release!());
      }
      expect(decide).not.toHaveBeenCalled();
    } finally {
      if (!unmounted) await act(() => root.unmount());
      node.remove();
      store.select(old.selection);
      store.setHumanInbox(old.humanInbox);
    }
  },
);

it.each([
  ['bash', 'orchestrator', undefined, true],
  ['secret_cli', 'orchestrator', undefined, false],
  ['secret_mcp_connect', 'orchestrator', undefined, false],
  ['bash', 'assignment', undefined, false],
  ['bash', 'orchestrator', 'group-room', false],
] as const)(
  'offers the full access entry on a %s card (%s, channel %s): %s',
  async (toolName, role, channelId, offered) => {
    const call: BridgeCall = async () => ({ ok: true, value: { status: 'pending' } });
    const message: ChannelMessage = {
      id: 'request',
      at: '2026-10-08T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      toolApprovalRequest: {
        sessionId: 'owned',
        callId: 'call',
        toolName,
        role,
        cwd: '/qa',
        input: '{}',
      },
    };
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const { channelSettings } = await import('../src/client/channel-settings-state.js');
    try {
      await act(async () =>
        root.render(
          createElement(ToolApprovalCard, {
            message,
            actions: createActions(call, store),
            t: zhTranslate,
            ...(channelId === undefined ? {} : { channelId }),
          }),
        ),
      );
      const entry = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === zhTranslate('approval.fullAccessEntry'),
      );
      expect(entry !== undefined).toBe(offered);
      if (entry !== undefined) {
        await act(async () => entry.click());
        expect(channelSettings.getSnapshot()).toEqual({
          open: true,
          sectionId: 'workspace-grants',
        });
      }
    } finally {
      channelSettings.close();
      await act(() => root.unmount());
      node.remove();
    }
  },
);

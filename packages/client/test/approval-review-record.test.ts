// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks')).comboboxPrimitives(),
);
vi.mock('../src/client/avatar', () => ({ PersonaBotAvatar: () => null }));
vi.mock('../src/client/channel-sidebar-icon', () => ({ ChannelSidebarIcon: () => null }));
import { isChannelMessage } from '../../core/src/channels/channel';
import { parseChannelMessage } from '../src/client/bridge';
import { AutoApprovalLine } from '../src/client/approval-template-entry';
import { OpaqueToolWarning } from '../src/client/approval-mask';
import { zhTranslate } from '../src/client/locale';

it.each(['allowed', 'ask-human', 'rejected'] as const)(
  'round trips and displays the canonical %s record',
  async (outcome) => {
    const record = {
      botSlug: 'ada',
      sessionId: 'session',
      callId: 'call',
      toolName: 'bash',
      input: '{"command":"echo QA"}',
      template: 'cautious',
      templateVersion: 'snapshot-version',
      outcome,
      reason: 'Check this command.',
    };
    const message = {
      id: 'record',
      at: '2026-11-16T01:00:00Z',
      author: { kind: 'system' },
      body: 'Review result',
      toolAutoApproval: record,
    };
    expect(isChannelMessage(message)).toBe(true);
    expect(parseChannelMessage(message)?.toolAutoApproval).toEqual(record);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(AutoApprovalLine, {
            messageId: 'record',
            record,
            bots: [],
            t: zhTranslate,
          }),
        ),
      );
      expect(host.querySelector('[data-auto-approval]')?.getAttribute('data-auto-approval')).toBe(
        outcome,
      );
      expect(host.textContent).toContain(
        zhTranslate(
          outcome === 'allowed'
            ? 'autoApproval.allowed'
            : outcome === 'ask-human'
              ? 'autoApproval.askHuman'
              : 'autoApproval.rejected',
          { template: zhTranslate('autoApproval.template.cautious') },
        ),
      );
      await act(async () => host.querySelector('button')!.click());
      expect(host.textContent).toContain('echo QA');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  },
);

it.each(['allowed-once', 'allowed-always-tool', 'rejected'] as const)(
  'retains the original opaque warning after %s',
  async (state) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(OpaqueToolWarning, {
            approval: {
              masked: false,
              kind: 'tool-approval',
              botSlug: 'ada',
              state,
              requestedAt: '2026-11-16T01:00:00Z',
              opaque: true,
            },
            t: zhTranslate,
          }),
        ),
      );
      expect(host.textContent).toContain(zhTranslate('approval.opaqueWarning'));
      await act(async () =>
        root.render(
          createElement(OpaqueToolWarning, {
            approval: {
              masked: true,
              kind: 'tool-approval',
              botSlug: 'ada',
              state,
              requestedAt: '2026-11-16T01:00:00Z',
            },
            t: zhTranslate,
          }),
        ),
      );
      expect(host.textContent).toBe('');
    } finally {
      act(() => root.unmount());
    }
  },
);

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { en } from '../src/client/locale.js';

const enTranslate = (key: string, params?: Record<string, unknown>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  );
import type { ChannelMessage } from '../src/client/store.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';
import { resourceEvents } from './resource-events-fixture.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).shellPrimitives(),
);

const request = (
  connectorRequest: NonNullable<ChannelMessage['toolApprovalRequest']>['connectorRequest'],
  canDecide = true,
): ChannelMessage => ({
  id: 'connector-card',
  at: '2026-11-28T00:00:00Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Approve connector_request',
  ...(canDecide
    ? {}
    : {
        approval: {
          masked: false as const,
          kind: 'tool-approval' as const,
          state: 'pending' as const,
          botSlug: 'ada',
          requestedAt: '2026-11-28T00:00:00Z',
          opaque: false,
          canDecide: false,
        },
      }),
  toolApprovalRequest: {
    role: 'orchestrator',
    sessionId: 'session',
    callId: 'call',
    toolName: 'connector_request',
    cwd: '/qa',
    input: '{}',
    ...(connectorRequest === undefined ? {} : { connectorRequest }),
  },
});

const account = {
  service: 'gmail',
  name: 'Gmail',
  access: 'read' as const,
  reason: 'Find the March invoice',
  account: { accountId: 'acc-1', label: 'Work mail', holder: 'shared' as const },
};

async function render(message: ChannelMessage, actions: Record<string, unknown>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const live = resourceEvents();
  await act(async () => {
    root.render(
      createElement(ToolApprovalCard, {
        message,
        actions: actions as never,
        hostScoped: true,
        t: enTranslate,
      }),
    );
  });
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  return {
    container,
    button,
    dispose: async () => {
      await act(async () => root.unmount());
      live.dispose();
    },
  };
}

describe('connector request card', () => {
  it('decides each choice through connectorRequestDecide and shows the account and reason', async () => {
    for (const [label, choice, outcome] of [
      ['Turn on for this Bot', 'persistent', 'Turned on for this Bot'],
      ['Just this once', 'once', 'Allowed this once'],
      ['No', 'deny', 'Declined'],
    ] as const) {
      const actions = {
        toolApprovalStatus: vi.fn(async () => 'pending' as const),
        decideToolApproval: vi.fn(),
        connectorRequestDecide: vi.fn(async () => ({ accepted: true })),
      };
      const view = await render(request(account), actions);
      try {
        expect(view.container.textContent).toContain('Wants to use Gmail');
        expect(view.container.textContent).toContain('Work mail');
        expect(view.container.textContent).toContain('Read');
        expect(view.container.textContent).toContain('Shared account');
        expect(view.container.textContent).toContain('Find the March invoice');
        expect(view.button('Allow once')).toBeUndefined();
        await act(async () => view.button(label)!.click());
        expect(actions.connectorRequestDecide).toHaveBeenCalledExactlyOnceWith(
          'dm-ada',
          'connector-card',
          choice,
        );
        expect(actions.decideToolApproval).not.toHaveBeenCalled();
        expect(view.container.querySelector('.bh-request-done')?.textContent).toBe(outcome);
        expect(view.button(label)).toBeUndefined();
      } finally {
        await view.dispose();
      }
    }
  });

  it('asks the Owner to connect an account first when none fits', async () => {
    const actions = {
      toolApprovalStatus: vi.fn(async () => 'pending' as const),
      decideToolApproval: vi.fn(),
      connectorRequestDecide: vi.fn(async () => ({ accepted: true })),
      connectors: vi.fn(async () => ({ configured: true, accounts: [], catalog: [] })),
    };
    const view = await render(
      request({ service: 'notion', name: 'Notion', access: 'write', reason: 'Draft notes' }),
      actions,
    );
    try {
      expect(view.container.textContent).toContain('Wants to use Notion, which has no account yet');
      expect(view.button('Connect in Settings')).toBeDefined();
      expect(view.button('Turn on for this Bot')).toBeUndefined();
      expect(view.button('Just this once')).toBeUndefined();
      expect(view.button('No')).toBeDefined();
    } finally {
      await view.dispose();
    }
  });

  it('shows the request read-only to someone who cannot decide it', async () => {
    const actions = {
      toolApprovalStatus: vi.fn(async () => 'pending' as const),
      decideToolApproval: vi.fn(),
      connectorRequestDecide: vi.fn(),
    };
    const view = await render(request(account, false), actions);
    try {
      expect(view.container.textContent).toContain('Wants to use Gmail');
      expect(view.button('Turn on for this Bot')).toBeUndefined();
      expect(view.button('No')).toBeUndefined();
      expect(view.container.querySelector('[data-approval-view-only]')).not.toBeNull();
    } finally {
      await view.dispose();
    }
  });

  it('shows an expired request without actions', async () => {
    const actions = {
      toolApprovalStatus: vi.fn(async () => 'expired' as const),
      decideToolApproval: vi.fn(),
      connectorRequestDecide: vi.fn(),
    };
    const view = await render(request(account), actions);
    try {
      expect(view.button('Turn on for this Bot')).toBeUndefined();
      expect(view.container.querySelector('.bh-request-done')?.getAttribute('data-state')).toBe(
        'expired',
      );
    } finally {
      await view.dispose();
    }
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
}));

vi.mock('../src/client/team-state.js', () => ({
  useTeamMode: () => ({ enabled: true }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { BotAccessEntry } from '../src/client/bot-access-entry.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';

const switches = (proactiveDms: boolean, speakerContext: boolean) => ({
  proactiveDms,
  joinPrincipalChannels: true,
  speakerContext,
});

describe('Bot access entry', () => {
  it('keeps the newest switch result when an older request finishes last', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const pending: ((value: unknown) => void)[] = [];
    const call = vi.fn(async (endpoint: string) => {
      if (endpoint === 'botVisibility')
        return {
          ok: true as const,
          value: {
            visibility: { kind: 'private' },
            switches: switches(false, true),
            audienceDirectory: { roles: [], members: [] },
          },
        };
      return new Promise((resolve) => pending.push(resolve));
    }) as unknown as BridgeCall;
    const box = (key: string): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>(`[data-bot-access-row="${key}"] [role="switch"]`)!;
    try {
      await act(async () =>
        root.render(
          createElement(BotAccessEntry, {
            botSlug: 'helper',
            channelId: 'dm-helper',
            scope: 'personabot',
            actions: { teamCall: call } as unknown as BridgeActions,
            t: zhTranslate,
          }),
        ),
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(box('proactiveDms').getAttribute('aria-checked')).toBe('false');
      await act(async () => box('proactiveDms').click());
      await act(async () => box('speakerContext').click());
      expect(pending).toHaveLength(2);
      await act(async () => pending[1]!({ ok: true, value: { switches: switches(true, false) } }));
      await act(async () => pending[0]!({ ok: true, value: { switches: switches(true, true) } }));
      expect(box('proactiveDms').getAttribute('aria-checked')).toBe('true');
      expect(box('speakerContext').getAttribute('aria-checked')).toBe('false');

      await act(async () => box('proactiveDms').click());
      await act(async () => box('speakerContext').click());
      expect(pending).toHaveLength(4);
      await act(async () => pending[2]!({ ok: true, value: { switches: switches(false, false) } }));
      await act(async () =>
        pending[3]!({
          ok: false,
          error: { code: 'permission-required', message: 'permission-required' },
        }),
      );
      expect(box('proactiveDms').getAttribute('aria-checked')).toBe('false');
      expect(box('speakerContext').getAttribute('aria-checked')).toBe('false');
      expect(container.textContent).toContain(zhTranslate('team.error.permissionRequired'));
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

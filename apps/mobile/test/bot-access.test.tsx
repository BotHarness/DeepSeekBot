// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));

import { botAccess, setBotAccess } from '../src/host/bot-access';
import type { HostClient, RosterBot } from '../src/host/client';
import { BotAccessScreen } from '../src/ui/chat/bot-access-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const bot: RosterBot = {
  slug: 'scout',
  displayName: 'Scout',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  hostAccess: { browser: false, computer: true },
  state: 'idle',
  paused: false,
};

function hostClient(call: (method: string, args?: Record<string, unknown>) => Promise<unknown>) {
  return {
    call: vi.fn(call),
    refresh: vi.fn(async () => undefined),
  } as unknown as HostClient & {
    call: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };
}

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(client: HostClient, value: RosterBot = bot) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<BotAccessScreen client={client} bot={value} />));
  const toggle = (kind: 'browser' | 'computer') =>
    container!.querySelector<HTMLInputElement>(`[data-testid="bot-access-${kind}"]`)!;
  return {
    toggle,
    rerender: (next: RosterBot) =>
      act(async () => root!.render(<BotAccessScreen client={client} bot={next} />)),
  };
}

describe('Bot access switches', () => {
  it("reads the Host's own setting rather than what this route can open", () => {
    expect(botAccess(bot)).toEqual({ browser: false, computer: true });
    const { hostAccess: _, ...older } = bot;
    expect(botAccess({ ...older, browserAccess: true })).toEqual({
      browser: true,
      computer: false,
    });
  });

  it('turns browser access on through the Host setter and refreshes the roster', async () => {
    const client = hostClient(async (method, args) => ({
      bot: {
        slug: 'scout',
        ...(method === 'browserAccessSet' && args?.['enabled'] ? { browserAccess: true } : {}),
      },
    }));
    const { toggle } = await render(client);
    expect(toggle('browser').checked).toBe(false);
    expect(toggle('computer').checked).toBe(true);
    await act(async () => toggle('browser').click());
    expect(client.call).toHaveBeenCalledWith('browserAccessSet', { slug: 'scout', enabled: true });
    expect(client.refresh).toHaveBeenCalled();
    expect(toggle('browser').checked).toBe(true);
    expect(container!.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the confirmed value until the roster catches up', async () => {
    const client = hostClient(async () => ({ bot: { slug: 'scout' } }));
    const { toggle, rerender } = await render(client);
    await act(async () => toggle('computer').click());
    expect(client.call).toHaveBeenCalledWith('computerAccessSet', {
      slug: 'scout',
      enabled: false,
    });
    expect(toggle('computer').checked).toBe(false);
    await rerender({ ...bot, hostAccess: { browser: false, computer: false } });
    expect(toggle('computer').checked).toBe(false);
    await rerender({ ...bot, hostAccess: { browser: false, computer: true } });
    expect(toggle('computer').checked).toBe(true);
  });

  it('rolls the switch back and explains when the Host refuses', async () => {
    let fail!: (error: Error) => void;
    const client = hostClient(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const { toggle } = await render(client);
    await act(async () => toggle('browser').click());
    expect(toggle('browser').checked).toBe(true);
    await act(async () => toggle('browser').click());
    expect(client.call).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error('Bot is paused.')));
    expect(toggle('browser').checked).toBe(false);
    expect(container!.querySelector('[role="alert"]')?.textContent).toBe(
      t.profilePermissions.accessFailed('Bot is paused.'),
    );
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('refuses an answer for another Bot', async () => {
    const client = hostClient(async () => ({ bot: { slug: 'other', browserAccess: true } }));
    await expect(setBotAccess(client, 'scout', 'browser', true)).rejects.toThrow(
      'browserAccessSet returned no Bot.',
    );
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { BotManagementEntry } from '../src/client/bot-management-entry.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function mount(call: BridgeCall): Promise<HTMLDivElement> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(BotManagementEntry, {
        botSlug: 'helper',
        channelId: 'dm-helper',
        scope: 'personabot',
        actions: { teamCall: call } as unknown as BridgeActions,
        t: zhTranslate,
      }),
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return container;
}

const toggle = (box: HTMLElement, capability: string): HTMLButtonElement =>
  box.querySelector<HTMLButtonElement>(
    `[data-bot-management-row="${capability}"] [role="switch"]`,
  )!;

const confirmButton = (): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '打开',
  )!;

describe('Bot management entry', () => {
  it('asks before turning a grant on and sends confirm with it', async () => {
    const call = vi.fn(async (endpoint: string, payload: unknown) => {
      if (endpoint === 'managementGrants')
        return {
          ok: true as const,
          value: {
            tobSlug: 'tob',
            editable: true,
            holders: [{ botSlug: 'tob', capabilities: ['manage-app', 'manage-bots'] }],
          },
        };
      expect(payload).toEqual({
        slug: 'helper',
        capability: 'manage-app',
        enabled: true,
        confirm: true,
      });
      return { ok: true as const, value: { capabilities: ['manage-app'], noAppManager: false } };
    }) as unknown as BridgeCall;
    const box = await mount(call);
    expect(toggle(box, 'manage-app').getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle(box, 'manage-app').click());
    expect(call).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('审批模板');
    await act(async () => confirmButton().click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(call).toHaveBeenCalledTimes(2);
    expect(toggle(box, 'manage-app').getAttribute('aria-checked')).toBe('true');
    expect(toggle(box, 'manage-bots').getAttribute('aria-checked')).toBe('false');
  });

  it('turns a grant off without asking and warns when no Bot manages the App', async () => {
    const call = vi.fn(async (endpoint: string, payload: unknown) => {
      if (endpoint === 'managementGrants')
        return {
          ok: true as const,
          value: { editable: true, holders: [{ botSlug: 'helper', capabilities: ['manage-app'] }] },
        };
      expect(payload).toEqual({ slug: 'helper', capability: 'manage-app', enabled: false });
      return { ok: true as const, value: { capabilities: [], noAppManager: true } };
    }) as unknown as BridgeCall;
    const box = await mount(call);
    expect(toggle(box, 'manage-app').getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle(box, 'manage-app').click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(toggle(box, 'manage-app').getAttribute('aria-checked')).toBe('false');
    expect(box.textContent).toContain('现在没有 Bot 能管理 App');
  });

  it('shows no switches to anyone but the Owner', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { holders: [], editable: false },
    })) as unknown as BridgeCall;
    const box = await mount(call);
    expect(box.querySelector('[role="switch"]')).toBeNull();
    expect(box.textContent).toContain('只有 App 的 Owner');
  });
});

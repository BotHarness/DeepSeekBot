// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const switches = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return {
    Switch: (props: {
      checked: boolean;
      disabled?: boolean;
      label: string;
      onChange: (value: boolean) => void;
    }) => {
      switches.push(props);
      return h('input', {
        type: 'checkbox',
        role: 'switch',
        'aria-label': props.label,
        checked: props.checked,
        disabled: props.disabled,
        onChange: () => {
          props.onChange(!props.checked);
        },
      });
    },
  };
});

import type { BridgeCall } from '../src/client/bridge.js';
import {
  en,
  zhTranslate,
  type BotHarnessKey,
  type BotHarnessTranslate,
} from '../src/client/locale.js';

const enTranslate = ((key: BotHarnessKey) => en[key]) as unknown as BotHarnessTranslate;
import { TelemetrySettings } from '../src/client/telemetry-settings.js';

const unusedHook = (): never => {
  throw new Error('This setting does not use native Session hooks');
};

async function render(call: BridgeCall, t: BotHarnessTranslate = zhTranslate) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(TelemetrySettings, {
        call,
        t,
        useSessions: unusedHook,
        useSessionStatus: unusedHook,
        useSessionRetainInfo: unusedHook,
        useWorkspaces: unusedHook,
        usePanelInfo: unusedHook,
      } as never),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  const toggle = () => host.querySelector<HTMLInputElement>('[role="switch"]')!;
  return {
    host,
    toggle,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('TelemetrySettings', () => {
  it('shows the Host state and turns usage statistics off and on through the bridge', async () => {
    let state = { enabled: true, preference: true };
    const call = vi.fn<BridgeCall>(async (endpoint, payload) => {
      if (endpoint === 'telemetrySet') {
        const enabled = (payload as { enabled: boolean }).enabled;
        state = { enabled, preference: enabled };
      }
      return { ok: true, value: state };
    });
    const view = await render(call);
    expect(view.host.textContent).toContain('匿名使用统计');
    const link = view.host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://tobs.app/privacy/');
    expect(view.toggle().checked).toBe(true);
    expect(view.toggle().disabled).toBe(false);

    await act(async () => {
      view.toggle().click();
    });
    expect(call.mock.calls[1]?.slice(0, 2)).toEqual(['telemetrySet', { enabled: false }]);
    expect(view.toggle().checked).toBe(false);

    await act(async () => {
      view.toggle().click();
    });
    expect(call.mock.calls[2]?.slice(0, 2)).toEqual(['telemetrySet', { enabled: true }]);
    expect(view.toggle().checked).toBe(true);
    view.unmount();
  });

  it.each([
    ['config', 'telemetry: false'],
    ['DO_NOT_TRACK', 'DO_NOT_TRACK=1'],
    ['BOTHARNESS_TELEMETRY', 'BOTHARNESS_TELEMETRY=0'],
  ])('is off and disabled with a note when %s forces it off', async (lockedBy, note) => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: { enabled: false, preference: true, lockedBy },
    }));
    const view = await render(call, enTranslate);
    expect(view.toggle().checked).toBe(false);
    expect(view.toggle().disabled).toBe(true);
    expect(view.host.querySelector(`[data-telemetry-lock="${lockedBy}"]`)?.textContent).toContain(
      note,
    );
    expect(view.host.querySelector('a')?.getAttribute('href')).toBe('https://tobs.app/en/privacy/');
    view.unmount();
  });

  it('restores the previous state and shows an error when saving fails', async () => {
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'telemetrySet'
        ? { ok: false, error: { code: 'telemetry-persist-failed', message: 'failed', details: {} } }
        : { ok: true, value: { enabled: true, preference: true } },
    );
    const view = await render(call);
    await act(async () => {
      view.toggle().click();
    });
    expect(view.toggle().checked).toBe(true);
    expect(view.host.querySelector('[role="alert"]')?.textContent).toBe('保存失败，请重试。');
    view.unmount();
  });
});

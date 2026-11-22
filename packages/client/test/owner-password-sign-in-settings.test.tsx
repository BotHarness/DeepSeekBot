// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ConnectionsPage } from '../src/client/connections-dialog.js';
import { zhTranslate } from '../src/client/locale.js';
import { TeamSection } from '../src/client/team-settings.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        host: { id: 'test-host', name: 'Studio' },
        devices: [],
        routes: { routes: [], tailscale: 'missing' },
        relationships: [],
      }),
    ),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string, within: ParentNode = host): HTMLButtonElement {
  const match = [...within.querySelectorAll('button')].find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

function field(inputLabel: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find(
    (node) => node.textContent === inputLabel,
  );
  const input = label?.control;
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${inputLabel}`);
  return input;
}

async function fill(label: string, value: string): Promise<void> {
  await act(async () => {
    const input = field(label);
    input.value = value;
    Simulate.change(input);
  });
}

function signInSwitch(): HTMLButtonElement {
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="账密登录"]');
  if (!toggle) throw new Error('Missing sign-in switch');
  return toggle;
}

it('sets up sign-in, then toggles it without re-entering credentials', async () => {
  let configured = false;
  let enabled = false;
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'ownerPasswordSignInSet') {
      configured = true;
      enabled = args['enabled'] === true;
    }
    return {
      ok: true,
      value: configured ? { enabled, username: 'studio-owner' } : { enabled },
    };
  });
  await act(async () => root.render(<ConnectionsPage t={zhTranslate} call={call} />));
  await act(async () => button('设置账密').click());
  await fill(zhTranslate('team.members.username'), 'studio-owner');
  await fill(zhTranslate('team.password.new'), 'some-test-password');
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('Missing sign-in setup dialog');
  expect(button(zhTranslate('team.ownerPassword.saveAndEnable'), dialog).disabled).toBe(true);
  await fill(zhTranslate('team.password.confirm'), 'some-test-password');
  await act(async () => button(zhTranslate('team.ownerPassword.saveAndEnable'), dialog).click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain('studio-owner');
  const toggle = signInSwitch();
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(
    call.mock.calls
      .filter(([method]) => method === 'ownerPasswordSignInSet')
      .map(([, args]) => args),
  ).toEqual([
    { enabled: true, username: 'studio-owner', password: 'some-test-password' },
    { enabled: false },
    { enabled: true },
  ]);
});

it('preserves the last settings value if a toggle is refused', async () => {
  let refuse = true;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'ownerPasswordSignInSet' && refuse) {
      return { ok: false, error: { code: 'unavailable', message: 'unavailable', details: {} } };
    }
    return {
      ok: true,
      value: { enabled: method === 'ownerPasswordSignInSet', username: 'existing-owner' },
    };
  });
  await act(async () => root.render(<ConnectionsPage t={zhTranslate} call={call} />));
  await act(async () => signInSwitch().click());
  expect(signInSwitch().getAttribute('aria-checked')).toBe('false');
  expect(host.textContent).toContain('保存失败，再试一次。');
  refuse = false;
  await act(async () => signInSwitch().click());
  expect(signInSwitch().getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).not.toContain('保存失败，再试一次。');
});

it('requires the current password and retains Team settings error handling', async () => {
  const mode = { ...fakeTeamMode(), ownerPasswordSet: true };
  let refuse = true;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamOwnerPasswordSet' && refuse) {
      return {
        ok: false,
        error: { code: 'credentials-invalid', message: 'credentials-invalid', details: {} },
      };
    }
    return {
      ok: true,
      value: method === 'teamMode' || method === 'teamOwnerPasswordSet' ? mode : [],
    };
  });
  await act(async () => root.render(<TeamSection t={zhTranslate} call={call} />));
  await act(async () => button(zhTranslate('team.ownerPassword.change')).click());
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('Missing change-password dialog');
  const submit = button(zhTranslate('team.save'), dialog);
  await fill(zhTranslate('team.password.new'), 'new-test-password');
  await fill(zhTranslate('team.password.confirm'), 'new-test-password');
  expect(submit.disabled).toBe(true);
  await fill(zhTranslate('team.password.current'), 'old-test-password');
  await act(async () => submit.click());
  expect([...dialog.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual([
    zhTranslate('team.error.credentialsInvalid'),
  ]);
  refuse = false;
  await act(async () => submit.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(call.mock.calls.filter(([method]) => method === 'teamOwnerPasswordSet')).toEqual([
    [
      'teamOwnerPasswordSet',
      { password: 'new-test-password', current: 'old-test-password' },
      undefined,
    ],
    [
      'teamOwnerPasswordSet',
      { password: 'new-test-password', current: 'old-test-password' },
      undefined,
    ],
  ]);
});

it('keeps the Owner controls unavailable in a member shell', async () => {
  vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false });
  const call = vi.fn<BridgeCall>(async () => ({
    ok: true,
    value: { enabled: true, username: 'studio-owner' },
  }));
  await act(async () => root.render(<ConnectionsPage t={zhTranslate} call={call} />));
  expect(host.textContent).not.toContain('账密登录');
  expect(call).not.toHaveBeenCalled();
});

it('hides the controls when the Host refuses the Owner permission', async () => {
  const call = vi.fn<BridgeCall>(async () => ({
    ok: false,
    error: { code: 'permission-required', message: 'permission-required', details: {} },
  }));
  await act(async () => root.render(<ConnectionsPage t={zhTranslate} call={call} />));
  expect(host.textContent).not.toContain('账密登录');
  expect(call).toHaveBeenCalledExactlyOnceWith('ownerPasswordSignIn', {}, expect.any(AbortSignal));
});

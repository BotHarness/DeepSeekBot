// @vitest-environment jsdom
import { type PrivateTunnelView } from '../src/client/private-tunnel-settings.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrivateTunnelSettings } from '../src/client/private-tunnel-settings.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (status: PrivateTunnelView) =>
  act(async () =>
    root.render(
      <PrivateTunnelSettings
        t={t}
        status={status}
        refresh={async () => undefined}
        pair={() => undefined}
        advanced={() => undefined}
        step="choose"
        setStep={() => undefined}
      />,
    ),
  );

it('copies the public address from its chip once connected', async () => {
  await render({ state: 'connected', mode: 'quick', origin: 'https://calm.trycloudflare.com' });
  expect(host.querySelector('[data-private-tunnel]')?.getAttribute('data-private-tunnel')).toBe(
    'connected',
  );
  const chip = host.querySelector<HTMLButtonElement>('[data-private-tunnel-origin]')!;
  expect(chip.textContent).toContain('https://calm.trycloudflare.com');
  await act(async () => chip.click());
  expect(writeText).toHaveBeenCalledWith('https://calm.trycloudflare.com');
  expect(chip.getAttribute('data-private-tunnel-origin')).toBe('copied');
});

it('asks the user to forward a fixed address to this computer until the check passes', async () => {
  await render({
    state: 'verifying',
    mode: 'named',
    origin: 'https://bot.example.com',
    originPort: 4100,
  });
  const block = host.querySelector('[data-private-tunnel-forward]');
  expect(block?.textContent).toContain(t('privateTunnel.panel.forwardTitle'));
  expect(block?.textContent).toContain('http://127.0.0.1:4100');
  expect(host.textContent).not.toContain(t('privateRelay.pair'));
});

it('starts Quick Tunnel only after an explicit action and keeps other deployments collapsed', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  await render({ state: 'off' });
  expect(fetch).not.toHaveBeenCalled();
  expect(host.textContent).toContain(t('privateTunnel.quickDescription'));
  expect(host.textContent).not.toContain(t('privateTunnel.namedDescription'));
  const start = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t('privateTunnel.panel.quickAction'),
  )!;
  await act(async () => start.click());
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
    action: 'add',
    routeId: 'quick',
    mode: 'quick',
    confirm: true,
  });
});

it('starts public direct in one action and offers a QR only after readiness', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const pair = vi.fn();
  const renderDirect = (
    route?: import('../src/client/private-tunnel-settings.js').PrivateRouteView,
  ) =>
    act(async () =>
      root.render(
        <PrivateTunnelSettings
          t={t}
          routes={route ? [route] : []}
          refresh={async () => undefined}
          pair={pair}
          advanced={() => undefined}
          step="direct"
          method="direct"
          setStep={() => undefined}
        />,
      ),
    );
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((value) => value.textContent === label);
  await renderDirect();
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => button(t('privateTunnel.direct.enable'))?.click());
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(
    JSON.stringify({
      action: 'add',
      mode: 'direct',
      routeId: 'direct',
      confirm: true,
    }),
  );
  const direct = { id: 'direct', mode: 'direct', enabled: true } as const;
  await renderDirect({ ...direct, state: 'error', issue: 'direct-port-busy' });
  expect(host.textContent).toContain(t('privateTunnel.direct.portBusy'));
  expect(button(t('privateRelay.pair'))).toBeUndefined();
  await renderDirect({ ...direct, state: 'connected', origin: 'https://public.example.test' });
  await act(async () => button(t('privateRelay.pair'))?.click());
  expect(pair).toHaveBeenCalledOnce();
});

it.each(['starting', 'verifying', 'error'] as const)(
  'withholds pairing while the public route is %s',
  async (state) => {
    await render({ state, mode: 'quick', issue: 'dns', probe: 'dns' });
    expect(host.textContent).not.toContain(t('privateRelay.pair'));
  },
);

it('keeps address-change recovery visible beside the verified Quick route', async () => {
  await render({
    state: 'connected',
    mode: 'quick',
    origin: 'https://calm.trycloudflare.com',
    addressChanged: true,
  });
  expect(host.textContent).toContain(t('privateTunnel.quickLifecycle'));
  expect(host.querySelector('[data-private-tunnel-changed]')?.textContent).toContain(
    t('privateTunnel.addressChanged'),
  );
  expect(host.textContent).toContain(t('privateRelay.pair'));
});

it.each([
  ['dns', 'connections.recovery.dns'],
  ['tls', 'connections.recovery.tls'],
  ['http-502', 'connections.recovery.forward'],
] as const)(
  'gives actionable %s ingress recovery while withholding pairing',
  async (probe, key) => {
    await render({
      state: 'error',
      mode: 'ingress',
      originPort: 4100,
      probe,
      issue: 'tunnel-unreachable',
    });
    expect(host.textContent).toContain(t(key));
    expect(host.textContent).not.toContain(t('privateRelay.pair'));
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const guide = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === t('connections.deploymentGuide'),
    )!;
    await act(async () => guide.click());
    expect(open).toHaveBeenCalledWith(
      t('connections.ingressGuideUrl'),
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  },
);

it('stops only the selected route and requires confirmation before removing configuration', async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true };
    }),
  );
  const refresh = vi.fn(async () => undefined);
  await act(async () =>
    root.render(
      <PrivateTunnelSettings
        t={t}
        routes={[
          {
            id: 'quick',
            enabled: true,
            state: 'connected',
            mode: 'quick',
            origin: 'https://quick.example.com',
          },
          {
            id: 'custom',
            enabled: false,
            state: 'off',
            mode: 'ingress',
            origin: 'https://custom.example.com',
          },
        ]}
        refresh={refresh}
        pair={() => undefined}
        advanced={() => undefined}
        step="choose"
        setStep={() => undefined}
      />,
    ),
  );
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === label,
    )!;
  expect(button(t('privateRelay.pair'))).toBeDefined();
  await act(async () => button(t('privateTunnel.routes.stop')).click());
  expect(requests).toEqual([{ action: 'stop', routeId: 'quick', confirm: true }]);
  await act(async () => button(t('privateTunnel.routes.start')).click());
  expect(requests[1]).toEqual({ action: 'start', routeId: 'custom', confirm: true });
  await act(async () => button(t('privateTunnel.routes.remove')).click());
  expect(requests).toHaveLength(2);
  expect(host.textContent).toContain(t('privateTunnel.routes.removeHint'));
  await act(async () => button(t('privateTunnel.routes.removeConfirm')).click());
  expect(requests[2]).toEqual({ action: 'remove', routeId: 'quick', confirm: true });
  expect(refresh).toHaveBeenCalledTimes(3);
});

it('shows an existing custom configuration as an explicit replacement form', async () => {
  await act(async () =>
    root.render(
      <PrivateTunnelSettings
        t={t}
        routes={[
          {
            id: 'custom',
            enabled: true,
            state: 'connected',
            mode: 'named',
            origin: 'https://custom.example.com',
          },
        ]}
        refresh={async () => undefined}
        pair={() => undefined}
        advanced={() => undefined}
        step="ingress"
        setStep={() => undefined}
      />,
    ),
  );
  expect(host.textContent).toContain(t('privateTunnel.routes.replaceHint'));
  expect(host.textContent).toContain(t('privateTunnel.routes.replaceConfirm'));
  expect(host.querySelector('[data-private-tunnel-setup="ingress"]')).not.toBeNull();
});

it('offers sign-in by address only on the custom route and explains the trade-off', async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    }),
  );
  const refresh = vi.fn(async () => undefined);
  const routes = (addressSignIn: boolean) => [
    {
      id: 'quick' as const,
      enabled: true,
      state: 'connected' as const,
      mode: 'quick' as const,
      origin: 'https://quick.trycloudflare.com',
    },
    {
      id: 'custom' as const,
      enabled: true,
      state: 'connected' as const,
      mode: 'named' as const,
      origin: 'https://team.example.com',
      addressSignIn,
    },
  ];
  const show = (addressSignIn: boolean, method?: 'named') =>
    act(async () =>
      root.render(
        <PrivateTunnelSettings
          t={t}
          routes={routes(addressSignIn)}
          refresh={refresh}
          pair={() => undefined}
          advanced={() => undefined}
          step="choose"
          setStep={() => undefined}
          method={method}
        />,
      ),
    );
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === label,
    )!;
  const details = () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes(t('privateTunnel.panel.manageHint')),
    )!;
  await show(false);
  await act(async () => button(t('privateTunnel.panel.manage')).click());
  await act(async () => details().click());
  expect(host.textContent).toContain(t('privateTunnel.panel.turnOffHint'));
  expect(host.querySelector('[data-private-route-address-sign-in]')).toBeNull();

  await act(async () => root.unmount());
  root = createRoot(host);
  await show(false, 'named');
  await act(async () => details().click());
  const fact = host.querySelector('[data-private-route-address-sign-in]')!;
  expect(fact.getAttribute('data-private-route-address-sign-in')).toBe('off');
  expect(fact.textContent).toContain(t('privateTunnel.addressSignInHint'));
  const toggle = fact.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle.click());
  expect(requests).toEqual([
    { action: 'address-sign-in', routeId: 'custom', enabled: true, confirm: true },
  ]);
  expect(refresh).toHaveBeenCalledTimes(1);

  await show(true, 'named');
  const on = host.querySelector('[data-private-route-address-sign-in]')!;
  expect(on.getAttribute('data-private-route-address-sign-in')).toBe('on');
  await act(async () => on.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(requests[1]).toEqual({
    action: 'address-sign-in',
    routeId: 'custom',
    enabled: false,
    confirm: true,
  });
});

it('blocks sign-in by address on a LAN ingress and explains a refused opt-in', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { ok: false, code: 'private-route-address-sign-in-unavailable' },
        { status: 409 },
      ),
    ),
  );
  const refresh = vi.fn(async () => undefined);
  const show = (lan: boolean) =>
    act(async () =>
      root.render(
        <PrivateTunnelSettings
          t={t}
          routes={[
            {
              id: 'custom',
              enabled: true,
              state: 'connected',
              mode: 'ingress',
              origin: 'https://team.example.com',
              lan,
              addressSignIn: false,
            },
          ]}
          refresh={refresh}
          pair={() => undefined}
          advanced={() => undefined}
          step="choose"
          setStep={() => undefined}
          method="ingress"
        />,
      ),
    );
  const details = () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes(t('privateTunnel.panel.manageHint')),
    )!;
  await show(true);
  await act(async () => details().click());
  const lanRow = host.querySelector('[data-private-route-address-sign-in]')!;
  expect(lanRow.textContent).toContain(t('privateTunnel.addressSignInLan'));
  expect(lanRow.querySelector('[role="switch"]')!.hasAttribute('disabled')).toBe(true);

  await show(false);
  const row = host.querySelector('[data-private-route-address-sign-in]')!;
  expect(row.textContent).toContain(t('privateTunnel.addressSignInHint'));
  await act(async () => row.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(
    host.querySelector('[data-private-tunnel-failure="private-route-address-sign-in-unavailable"]')
      ?.textContent,
  ).toContain(t('privateTunnel.addressSignInUnavailable'));
  expect(refresh).not.toHaveBeenCalled();
});

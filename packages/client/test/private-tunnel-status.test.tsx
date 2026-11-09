// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PrivateTunnelSettings,
  type PrivateTunnelView,
} from '../src/client/private-tunnel-settings.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button', Switch: 'input' }));

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

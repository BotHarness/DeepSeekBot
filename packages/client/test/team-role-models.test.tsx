// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).comboboxPrimitives(),
);
import { RoleModelsField } from '../src/client/team-role-models.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';

it('shows a retryable error when subscription accounts fail to load', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let accountsFail = true;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'engineAccounts')
      return accountsFail
        ? { ok: false, error: { code: 'unavailable', message: 'down', details: {} } }
        : {
            ok: true,
            value: { accounts: [{ id: 'codex-work', engine: 'codex', name: 'Work' }] },
          };
    if (method === 'modelProviders') return { ok: true, value: { revision: 1, providers: [] } };
    if (method === 'modelCatalog') return { ok: true, value: { models: [] } };
    return { ok: true, value: {} };
  });
  const render = () =>
    root.render(
      <RoleModelsField
        call={call}
        t={zhTranslate}
        viewer={{ owner: true, permissions: [] }}
        value={{ kind: 'only', providers: [], routes: [] }}
        disabled={false}
        onChange={() => undefined}
      />,
    );
  try {
    await act(async () => render());
    expect(host.textContent).toContain('无法加载订阅账号。');
    expect(host.textContent).not.toContain('Codex · Work');
    const retry = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === '重新读取',
    );
    expect(retry).toBeTruthy();
    accountsFail = false;
    await act(async () => retry!.click());
    expect(host.textContent).not.toContain('无法加载订阅账号。');
    expect(host.textContent).toContain('Codex · Work');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

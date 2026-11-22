// @vitest-environment jsdom
import { choose, translate } from './model-preset-profile-fixtures.js';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { createHostClient } from '@botharness/host-client/client';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { RemoteHostModels } from '../src/client/remote-host-models.js';

let root: Root | undefined;
afterEach(async () => {
  if (root !== undefined) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const flash = { provider: 'deepseek', model: 'flash' };
const pro = { provider: 'deepseek', model: 'pro' };

async function flush() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

it('edits a remote preset Task model list as a draft and saves it in one write', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = new FakeHost();
  const client = createHostClient({
    routes: ['https://remote.example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  const sub = {
    choices: [{ kind: 'model', ...flash, allowedEfforts: [''], defaultEffort: '' }],
    default: { kind: 'model', ...flash },
  };
  host.methods.set('modelCatalog', () => ({
    models: [
      { ...flash, providerName: 'DeepSeek', modelName: 'Flash' },
      { ...pro, providerName: 'DeepSeek', modelName: 'Pro' },
    ],
    default: flash,
    defaultRevision: 1,
  }));
  host.methods.set('modelPresets', () => ({
    presets: [
      {
        id: 'daily',
        name: 'Daily',
        revision: 4,
        orchestrator: flash,
        assignmentDefault: flash,
        sub,
      },
    ],
  }));
  host.methods.set('modelPresetSubSet', (args) => ({
    id: 'daily',
    revision: 5,
    sub: (args as { sub: unknown }).sub,
  }));
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(createElement(RemoteHostModels, { hostId: 'remote', client, t: translate })),
  );
  await flush();
  const select = container.querySelector<HTMLElement>('[aria-label="Models"]');
  expect(select).not.toBeNull();
  await act(async () => select!.click());
  await flush();
  const option = [...document.querySelectorAll<HTMLElement>('[tabindex="-1"]')].find(
    (node) => node.textContent === 'Daily',
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  await flush();
  expect(container.textContent).toContain('Flash');
  await choose('Add a task model', 'pro', 'Pro');
  expect(host.calls.some((call) => call.method === 'modelPresetSubSet')).toBe(false);
  const save = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === 'Save',
  );
  await act(async () => save!.click());
  await flush();
  const write = host.calls.find((call) => call.method === 'modelPresetSubSet');
  expect(write?.args).toMatchObject({
    id: 'daily',
    expectedRevision: 4,
    sub: {
      choices: [
        { kind: 'model', ...flash },
        { kind: 'model', ...pro },
      ],
      default: { kind: 'model', ...flash },
    },
  });
});

// @vitest-environment jsdom
import { choose, translate } from './model-preset-profile-fixtures.js';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { createHostClient } from '@botharness/host-client/client';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { hostSettingsDrafts } from '../src/client/host-settings-drafts.js';
import { RemoteHostModels } from '../src/client/remote-host-models.js';

let root: Root | undefined;
afterEach(async () => {
  if (root !== undefined) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const flash = { provider: 'deepseek', model: 'flash' };
const pro = { provider: 'deepseek', model: 'pro' };
const flashChoice = { kind: 'model', ...flash, allowedEfforts: [''], defaultEffort: '' };

async function flush() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function open(
  hostId: string,
  onWrite: (args: { sub: unknown; expectedRevision: number }) => unknown,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = new FakeHost();
  const client = createHostClient({
    routes: [`https://${hostId}.example.ts.net`],
    credential: host.credential,
    carrier: host.carrier,
  });
  const state = {
    revision: 4,
    sub: { choices: [flashChoice], default: { kind: 'model', ...flash } } as unknown,
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
        revision: state.revision,
        orchestrator: flash,
        assignmentDefault: flash,
        sub: state.sub,
      },
    ],
  }));
  host.methods.set(
    'modelPresetSubSet',
    (args) =>
      onWrite(args as never) ??
      (() => {
        const { sub } = args as { sub: unknown };
        state.revision += 1;
        state.sub = sub;
        return { id: 'daily', revision: state.revision, sub };
      })(),
  );
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(createElement(RemoteHostModels, { hostId, client, t: translate })),
  );
  await flush();
  await act(async () => container.querySelector<HTMLElement>('[aria-label="Models"]')!.click());
  await flush();
  const option = [...document.querySelectorAll<HTMLElement>('[tabindex="-1"]')].find(
    (node) => node.textContent === 'Daily',
  );
  await act(async () => option!.click());
  await flush();
  const save = () =>
    act(async () =>
      [...container.querySelectorAll('button')]
        .find((node) => node.textContent === 'Save')!
        .click(),
    );
  return { host, state, container, save };
}

const writes = (host: FakeHost) => host.calls.filter((call) => call.method === 'modelPresetSubSet');

it('saves an edited Task model list once and shows the saved list', async () => {
  const { host, container, save } = await open('one', () => undefined);
  await choose('Add a task model', 'pro', 'Pro');
  expect(writes(host)).toHaveLength(0);
  await save();
  await flush();
  expect(writes(host)).toHaveLength(1);
  expect(writes(host)[0]?.args).toMatchObject({
    id: 'daily',
    expectedRevision: 4,
    sub: {
      choices: [flashChoice, { kind: 'model', ...pro }],
      default: { kind: 'model', ...flash },
    },
  });
  expect(container.textContent).toContain('Pro');
  expect(
    [...container.querySelectorAll('button')].some((node) => node.textContent === 'Cancel'),
  ).toBe(false);
});

it('retries a failed save at the revision the draft started from', async () => {
  let fail = true;
  const { host, state, save } = await open('two', () => {
    if (!fail) return undefined;
    fail = false;
    state.revision = 5;
    throw Object.assign(new Error('changed'), { code: 'stale-setting' });
  });
  await choose('Add a task model', 'pro', 'Pro');
  await save();
  await flush();
  await save();
  await flush();
  expect(
    writes(host).map((call) => (call.args as { expectedRevision: number }).expectedRevision),
  ).toEqual([4, 4]);
});

it('counts a Task model edit as an unsaved Host settings draft and discards it', async () => {
  const { container } = await open('three', () => undefined);
  expect(hostSettingsDrafts.hasDirty('three')).toBe(false);
  await choose('Add a task model', 'pro', 'Pro');
  expect(hostSettingsDrafts.hasDirty('three')).toBe(true);
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((node) => node.textContent === 'Cancel')!
      .click(),
  );
  expect(hostSettingsDrafts.hasDirty('three')).toBe(false);
});

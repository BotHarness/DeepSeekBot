// @vitest-environment jsdom
import { button, catalog, translate } from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import { OWNER_HUMAN_CONTEXT } from '../../core/src/humans/context.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteHostModels } from '../src/client/remote-host-models.js';
import { createHostClient } from '@botharness/host-client/client';
import { createCore } from '../../core/src/plugin.js';
import { createBridgeMethods } from '../../core/src/bridge/methods.js';
import { createTempRoot } from '../../core/test/helpers.js';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const remoteCores: ReturnType<typeof createCore>[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root !== undefined) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
  for (const core of remoteCores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function remoteOwner() {
  const core = createCore({
    dshHome: createTempRoot('bh-remote-preset-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        throw new Error('Unexpected Assignment');
      },
      async close() {},
    },
  });
  remoteCores.push(core);
  const route = { provider: 'deepseek', model: 'flash' };
  const first = core.modelPresets.create({
    name: 'First',
    orchestrator: route,
    assignmentDefault: route,
  });
  const second = core.modelPresets.create({
    name: 'Second',
    orchestrator: route,
    assignmentDefault: route,
  });
  let validate = async () => {};
  const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    ...core,
    modelCatalog: { list: async () => catalog, validate: () => validate() },
    defaultModel: { currentSelection: () => route },
  });
  const methods = new Map<string, (payload: unknown) => unknown>([
    ['modelCatalog', bridge.modelCatalog],
    ['modelPresets', bridge.modelPresets],
    ['modelPresetUpdate', bridge.modelPresetUpdate],
    ['modelPresetCreate', bridge.modelPresetCreate],
  ]);
  const client = createHostClient({
    routes: ['https://source.example.ts.net'],
    credential: 'test-only',
    carrier: {
      async request(url, init) {
        const method = methods.get(url.split('/').at(-1)!);
        if (method === undefined) throw new Error('Unexpected method');
        const { payload } = JSON.parse(String(init.body));
        const result = await method(payload.args);
        return {
          status: 200,
          text: async () => JSON.stringify({ type: 'server-response', result }),
        };
      },
      openSocket() {
        throw new Error('Unexpected socket');
      },
    },
  });
  return {
    core,
    bridge,
    client,
    first,
    second,
    pause: (work: () => Promise<void>) => {
      validate = work;
    },
  };
}

async function renderRemote(owner: ReturnType<typeof remoteOwner>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  if (root === undefined) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(
      createElement(RemoteHostModels, {
        key: owner.first.id,
        hostId: 'remote-host',
        client: owner.client,
        t: translate,
      }),
    );
  });
}

async function selectRemotePreset(name: string) {
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('remoteHosts.settings.models')}"]`,
      )!
      .click();
  });
  await act(async () => button(name).click());
}

async function editRemoteName(name: string) {
  const field = [...document.querySelectorAll('label')].find((label) =>
    label.textContent?.includes(translate('modelPreset.name')),
  )!;
  const input = document.getElementById(field.htmlFor) as HTMLInputElement;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

describe('Remote preset name commits through the source Host owner', () => {
  it('saves Enter once, leaves a later blur unsaved, and commits only through explicit Save', async () => {
    const owner = remoteOwner();
    await renderRemote(owner);
    await selectRemotePreset('First');
    const input = await editRemoteName('Renamed');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(owner.core.modelPresets.get(owner.first.id)).toMatchObject({
      name: 'Renamed',
      revision: 2,
    });
    await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(owner.core.modelPresets.get(owner.first.id)?.revision).toBe(2);
    await editRemoteName('Blur saved');
    await act(async () => input.blur());
    expect(owner.core.modelPresets.get(owner.first.id)?.revision).toBe(2);
    await act(async () => button(translate('relationships.save')).click());
    expect(owner.core.modelPresets.get(owner.first.id)).toMatchObject({
      name: 'Blur saved',
      revision: 3,
    });
  });

  it('retains the draft and error after an owner conflict until an explicit refresh and retry', async () => {
    const owner = remoteOwner();
    await renderRemote(owner);
    await selectRemotePreset('First');
    const input = await editRemoteName('My draft');
    owner.core.modelPresets.update(owner.first.id, {
      ...owner.first,
      name: 'Other device',
      expectedRevision: 1,
    });
    await act(async () => button(translate('relationships.save')).click());
    expect(owner.core.modelPresets.get(owner.first.id)).toMatchObject({
      name: 'Other device',
      revision: 2,
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      translate('remoteHosts.settings.error'),
    );
    expect(input.value).toBe('My draft');
    await act(async () => button(translate('onboarding.refreshModels')).click());
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(owner.core.modelPresets.get(owner.first.id)).toMatchObject({
      name: 'My draft',
      revision: 3,
    });
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps pending writes bound to their original preset and Host after closing and reopening', async () => {
    const owner = remoteOwner();
    await renderRemote(owner);
    await selectRemotePreset('First');
    await editRemoteName('First saved');
    await act(async () => button(translate('relationships.save')).click());
    await selectRemotePreset('Second');
    await editRemoteName('Second saved after close');
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    owner.pause(() => gate);
    await act(async () => button(translate('relationships.save')).click());
    expect(owner.core.modelPresets.get(owner.second.id)?.name).toBe('Second');
    await act(async () => root!.render(null));
    const next = remoteOwner();
    await renderRemote(next);
    await selectRemotePreset('First');
    const nextInput = await editRemoteName('New Host draft');
    await act(async () => {
      release();
    });
    expect(owner.core.modelPresets.get(owner.first.id)).toMatchObject({
      name: 'First saved',
      revision: 2,
    });
    expect(owner.core.modelPresets.get(owner.second.id)).toMatchObject({
      name: 'Second saved after close',
      revision: 2,
    });
    expect(nextInput.value).toBe('New Host draft');
    expect(next.core.modelPresets.get(next.first.id)).toMatchObject({ name: 'First', revision: 1 });
    expect(next.core.modelPresets.get(next.second.id)).toMatchObject({
      name: 'Second',
      revision: 1,
    });
  });

  it('requires the create action for a new preset instead of Enter or blur', async () => {
    const owner = remoteOwner();
    await renderRemote(owner);
    const input = await editRemoteName('Created explicitly');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.blur();
    });
    expect(owner.core.modelPresets.list()).toHaveLength(2);
    await act(async () => button(translate('modelPreset.saveAs')).click());
    expect(owner.core.modelPresets.list().map((preset) => preset.name)).toContain(
      'Created explicitly',
    );
    expect(input.value).toBe('');
  });
});

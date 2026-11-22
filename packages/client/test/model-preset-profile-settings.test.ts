// @vitest-environment jsdom
import { button, catalog, choose, translate } from './model-preset-profile-fixtures.js';
import { type Root } from 'react-dom/client';
import type { BridgeCall } from '../src/client/bridge.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';
import { OWNER_HUMAN_CONTEXT } from '../../core/src/humans/context.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPresetsSettings } from '../src/client/model-presets-settings.js';
import { setTeamModeSnapshot } from '../src/client/team-state.js';
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

describe('Model Presets Settings', () => {
  async function renderLibrary(permissions: string[], owner = remoteOwner()) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const { bridge } = owner;
    const endpoints = new Map<string, (payload: unknown) => unknown>([
      ['modelPresets', bridge.modelPresets],
      ['modelPresetCreate', bridge.modelPresetCreate],
      ['modelPresetUpdate', bridge.modelPresetUpdate],
      ['modelPresetDelete', bridge.modelPresetDelete],
    ]);
    const call = vi.fn<BridgeCall>(async (method, args) => {
      const run = endpoints.get(method);
      if (run === undefined) throw new Error('Unexpected method');
      const result = await run(args);
      if (typeof result !== 'object' || result === null || !('ok' in result))
        throw new Error('Unexpected answer');
      return result as Awaited<ReturnType<BridgeCall>>;
    });
    setTeamModeSnapshot(call, {
      enabled: true,
      ownerPasswordSet: true,
      insecureHttpAllowed: false,
      memberUrls: [],
      isolation: 'trial',
      viewer: {
        humanId: 'reviewer',
        displayName: 'Reviewer',
        kind: 'member',
        owner: false,
        mustChangePassword: false,
        permissions,
        roleIds: [],
      },
    });
    await act(async () =>
      root!.render(
        createElement(ModelPresetsSettings, {
          call,
          actions: {
            modelCatalog: async () => ({ models: catalog }),
            routingGroups: async () => ({ groups: [], rests: [] }),
            routingGroupEngines: async () => [],
            createRoutingGroup: vi.fn(),
            updateRoutingGroup: vi.fn(),
            deleteRoutingGroup: vi.fn(),
          },
          t: translate,
        }),
      ),
    );
    return { ...owner, call, host: container };
  }

  it('lists all presets and both provider choices for a read-only Member', async () => {
    const { host, call } = await renderLibrary(['models.use']);
    expect(host.textContent).toContain('First');
    expect(host.textContent).toContain('Second');
    expect(host.textContent).toContain('Main model · Flash · DeepSeek');
    expect(host.textContent).toContain('Task model · Flash · DeepSeek');
    expect(host.textContent).toContain('Used by 0 Bots');
    expect(host.querySelector('button')).toBeNull();
    expect(call).toHaveBeenCalledExactlyOnceWith('modelPresets', { includeUsage: true }, undefined);
  });

  it('creates and edits choices and policy, then confirms deletion with the names of affected Bots', async () => {
    const owner = remoteOwner();
    owner.core.registry.create({ slug: 'ada', displayName: 'Ada' });
    owner.core.registry.applyModelPreset('ada', owner.first);
    const { host, call } = await renderLibrary(['models.configure'], owner);
    expect(host.textContent).toContain('Used by 1 Bot');
    await act(async () => button('Create preset').click());
    await typeInto(fieldNamed('Preset name', dialog()), 'Third');
    await choose('Main model', 'pro', 'Pro');
    await choose('Add an allowed model', 'k2', 'Kimi K2');
    await act(async () => button('Save').click());
    expect(host.textContent).toContain('Third');
    expect(host.textContent).toContain('Kimi K2 · Moonshot');

    await act(async () => buttonNamed('Edit preset “Third”').click());
    await typeInto(fieldNamed('Preset name', dialog()), 'Renamed');
    await choose('Add an allowed model', 'flash', 'Flash');
    await act(async () => button('Save').click());
    expect(
      owner.core.modelPresets.list().find((preset) => preset.name === 'Renamed'),
    ).toMatchObject({
      assignmentModels: expect.arrayContaining([expect.objectContaining({ model: 'flash' })]),
      sub: {
        choices: [
          expect.objectContaining({ kind: 'model', model: 'k2' }),
          expect.objectContaining({ kind: 'model', model: 'flash' }),
        ],
        default: { kind: 'model', provider: 'kimi', model: 'k2' },
      },
    });

    await act(async () => buttonNamed('Delete preset “First”').click());
    expect(dialog().textContent).toContain('Ada');
    expect(dialog().textContent).toContain('keep their applied model settings');
    expect(call.mock.calls.some(([method]) => method === 'modelPresetDelete')).toBe(false);
    await act(async () => buttonNamed('Delete', dialog()).click());
    expect(owner.core.modelPresets.get(owner.first.id)).toBeUndefined();
    expect(owner.core.registry.get('ada')?.modelPlan?.sourcePresetId).toBe(owner.first.id);
  });
});

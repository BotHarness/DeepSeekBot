import { describe, expect, it } from 'vitest';

import {
  applyModelPreset,
  authorizeWorkspacePath,
  botSettings,
  chooseModel,
  currentModel,
  folderBrowsingUnavailable,
  listHostFolders,
  loadApprovalTemplates,
  loadAssignmentAccess,
  loadBotModel,
  loadWorkspaceGrants,
  resolveWorkspaceFolder,
  revokeWorkspaceGrant,
  setApprovalTemplate,
  setAssignmentAccess,
} from '../src/host/bot-settings';
import { createHostClient } from '../src/host/client';
import { modelLabel, workspaceLabel } from '../src/ui/chat/composer-labels';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const slug = 'ada';

const flash = { provider: 'deepseek', model: 'deepseek-v4-flash' };
const pro = { provider: 'deepseek', model: 'deepseek-v4-pro' };
const catalog = {
  models: [
    { ...flash, providerName: 'DeepSeek', modelName: 'DeepSeek V4 Flash', efforts: [] },
    { ...pro, providerName: 'DeepSeek', modelName: 'DeepSeek V4 Pro', efforts: [] },
    {
      provider: 'openai',
      model: 'gpt-5',
      providerName: 'OpenAI',
      modelName: 'GPT-5',
      efforts: [],
      credential: 'missing',
    },
  ],
  default: flash,
};
const plan = {
  revision: 4,
  sourcePresetId: '',
  sourcePresetName: '',
  orchestrator: { ...pro, reasoningEffort: 'high' },
  assignmentDefault: flash,
  assignmentModels: [{ ...flash, allowedEfforts: ['', 'high'], defaultEffort: '' }],
  appliedAt: '2026-10-14T08:00:00.000Z',
};

function client(fake: FakeHost) {
  return createHostClient({ routes: [ROUTE], credential: fake.credential, carrier: fake.carrier });
}

function calls(fake: FakeHost) {
  return fake.calls.map((call) => [call.method, call.args]);
}

describe('Bot model from the composer', () => {
  it('reads the Model Plan, the catalog and the presets, and names the current model', async () => {
    const fake = new FakeHost();
    fake.methods.set('modelPlan', () => ({ revision: 4, plan }));
    fake.methods.set('modelCatalog', () => catalog);
    fake.methods.set('modelPresets', () => ({
      presets: [
        { id: 'fast', name: 'Fast', revision: 1, orchestrator: flash, assignmentDefault: flash },
      ],
    }));

    const model = await loadBotModel(client(fake), slug);

    expect(calls(fake)).toEqual(
      expect.arrayContaining([
        ['modelPlan', { slug }],
        ['modelCatalog', {}],
        ['modelPresets', {}],
      ]),
    );
    expect(model.revision).toBe(4);
    expect(model.plan?.orchestrator).toEqual({ ...pro, reasoningEffort: 'high' });
    expect(model.models.map((entry) => entry.modelName)).toEqual([
      'DeepSeek V4 Flash',
      'DeepSeek V4 Pro',
      'GPT-5',
    ]);
    expect(model.models[2]?.credential).toBe('missing');
    expect(model.presets).toEqual([
      { id: 'fast', name: 'Fast', revision: 1, orchestrator: flash, assignmentDefault: flash },
    ]);
    expect(currentModel(model).name).toBe('DeepSeek V4 Pro');
    expect(modelLabel({ status: 'ready', value: model })).toBe('DeepSeek V4 Pro');
  });

  it('falls back to the global default model when the Bot has no plan, and survives missing presets', async () => {
    const fake = new FakeHost();
    fake.methods.set('modelPlan', () => ({ revision: 2 }));
    fake.methods.set('modelCatalog', () => catalog);
    fake.methods.set('modelPresets', () => {
      throw new Error('presets unavailable');
    });

    const model = await loadBotModel(client(fake), slug);

    expect(model.plan).toBeUndefined();
    expect(model.presets).toEqual([]);
    expect(currentModel(model)).toEqual({ route: flash, name: 'DeepSeek V4 Flash' });
  });

  it('labels a missing, loading or failed model', async () => {
    expect(modelLabel({ status: 'loading' })).toBe(t.contextLoading);
    expect(modelLabel({ status: 'failed', error: 'down' })).toBe(t.contextUnavailable);
    expect(modelLabel({ status: 'ready', value: { revision: 0, models: [], presets: [] } })).toBe(
      t.noModel,
    );
    expect(
      modelLabel({
        status: 'ready',
        value: { revision: 0, models: [], presets: [], repair: 'legacy-missing' },
      }),
    ).toBe(t.contextUnavailable);
  });

  it('switches the main model and keeps the Assignment models of the current plan', async () => {
    const fake = new FakeHost();
    fake.methods.set('modelPlanCustomize', (args) => ({
      plan: { ...plan, revision: 5, orchestrator: args['orchestrator'] },
    }));
    const model = {
      revision: 4,
      plan: { ...plan },
      models: [],
      presets: [],
    };

    const applied = await chooseModel(client(fake), slug, model, flash);

    expect(calls(fake)).toEqual([
      [
        'modelPlanCustomize',
        {
          slug,
          expectedRevision: 4,
          orchestrator: flash,
        },
      ],
    ]);
    expect(applied.revision).toBe(5);

    fake.calls.length = 0;
    await chooseModel(client(fake), slug, model, pro);
    expect(fake.calls[0]?.args['orchestrator']).toEqual({ ...pro, reasoningEffort: 'high' });
  });

  it('customizes only the Orchestrator when the Bot inherits the default', async () => {
    const fake = new FakeHost();
    fake.methods.set('modelPlanCustomize', (args) => ({
      plan: { revision: 3, orchestrator: args['orchestrator'] },
    }));

    await chooseModel(client(fake), slug, { revision: 2, models: [], presets: [] }, pro);

    expect(calls(fake)).toEqual([
      [
        'modelPlanCustomize',
        {
          slug,
          expectedRevision: 2,
          orchestrator: pro,
        },
      ],
    ]);
  });

  it('applies a preset and refuses an answer without a plan', async () => {
    const fake = new FakeHost();
    fake.methods.set('modelPresetApply', () => ({ plan: { ...plan, sourcePresetId: 'fast' } }));
    const applied = await applyModelPreset(client(fake), slug, 'fast');
    expect(calls(fake)).toEqual([['modelPresetApply', { slug, presetId: 'fast' }]]);
    expect(applied.sourcePresetId).toBe('fast');

    fake.methods.set('modelPresetApply', () => ({}));
    await expect(applyModelPreset(client(fake), slug, 'fast')).rejects.toThrow(
      'modelPresetApply returned no Model Plan.',
    );
  });
});

const grant = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  botSlug: slug,
  workspaceId: `ws-${id}`,
  workspacePath: `/Users/ada/${id}`,
  workspaceTitle: id,
  createdAt: '2026-10-14T08:00:00.000Z',
  ...extra,
});

describe('Bot workspace from the composer', () => {
  it('lists the active folders and removes one', async () => {
    const fake = new FakeHost();
    fake.methods.set('grants', () => ({
      grants: [
        grant('site', { orchestratorWrite: true }),
        grant('old', { revokedAt: '2026-10-13T08:00:00.000Z' }),
      ],
    }));
    fake.methods.set('grantRevoke', (args) => ({
      grant: grant('site', { id: args['grantId'], revokedAt: '2026-10-14T09:00:00.000Z' }),
    }));
    const host = client(fake);

    const grants = await loadWorkspaceGrants(host, slug);
    expect(grants).toEqual([
      {
        id: 'site',
        workspaceId: 'ws-site',
        workspacePath: '/Users/ada/site',
        workspaceTitle: 'site',
        orchestratorWrite: true,
      },
    ]);
    expect(workspaceLabel({ status: 'ready', value: grants })).toBe(t.folderCount(1));

    const revoked = await revokeWorkspaceGrant(host, slug, 'site');
    expect(revoked.revokedAt).toBe('2026-10-14T09:00:00.000Z');
    expect(calls(fake)).toEqual([
      ['grants', { slug }],
      ['grantRevoke', { slug, grantId: 'site' }],
    ]);
  });

  it("browses the computer's folders through the DSH directory picker", async () => {
    const fake = new FakeHost();
    fake.methods.set('directoryPicker/list', (args) => ({
      path: args['path'] ?? '/Users/ada',
      home: '/Users/ada',
      crumbs: [
        { name: '/', path: '/', hidden: false },
        { name: 'ada', path: '/Users/ada', hidden: false },
      ],
      entries: [
        { name: 'site', path: '/Users/ada/site', hidden: false },
        { name: '.config', path: '/Users/ada/.config', hidden: true },
      ],
      truncated: false,
    }));
    const host = client(fake);

    const home = await listHostFolders(host);
    await listHostFolders(host, '/Users/ada/site');

    expect(home.path).toBe('/Users/ada');
    expect(home.entries.map((entry) => [entry.name, entry.hidden])).toEqual([
      ['site', false],
      ['.config', true],
    ]);
    expect(calls(fake)).toEqual([
      ['directoryPicker/list', {}],
      ['directoryPicker/list', { path: '/Users/ada/site' }],
    ]);
    expect(fake.requests).toContain(`POST ${ROUTE}/botharness-device/api/directoryPicker/list`);
  });

  it('recognises a computer that cannot list folders', async () => {
    const fake = new FakeHost();
    fake.answers.set('directoryPicker/list', () => ({
      ok: false,
      error: { code: 'directory-picker/unavailable', message: 'No folder browser' },
    }));

    const failure = await listHostFolders(client(fake)).catch((error: unknown) => error);

    expect(folderBrowsingUnavailable(failure)).toBe(true);
    expect(folderBrowsingUnavailable(new Error('other'))).toBe(false);
  });

  it('resolves a folder before the confirmation, then grants it', async () => {
    const fake = new FakeHost();
    fake.methods.set('workspace/create', (args) => {
      const path = (args['request'] as { path: string }).path;
      return { workspace: { workspaceId: 'ws-site', path, title: 'site', sessionIds: [] } };
    });
    fake.methods.set('workspaceOptions', () => ({
      workspaces: [
        { id: 'ws-other', path: '/Users/ada/other', title: 'other' },
        { id: 'ws-site', path: '/Users/ada/site', title: 'site' },
      ],
    }));
    fake.methods.set('grantCreate', (args) => ({
      grant: grant('site', { workspaceId: args['workspaceId'] }),
    }));
    const host = client(fake);

    const resolved = await resolveWorkspaceFolder(host, '/Users/ada/site');
    expect(resolved).toEqual({ id: 'ws-site', path: '/Users/ada/site', title: 'site' });

    const created = await authorizeWorkspacePath(host, slug, resolved.path);
    expect(created.workspaceId).toBe('ws-site');
    expect(calls(fake)).toEqual([
      ['workspace/create', { request: { path: '/Users/ada/site' } }],
      ['workspaceOptions', {}],
      ['workspace/create', { request: { path: '/Users/ada/site' } }],
      ['grantCreate', { slug, workspaceId: 'ws-site' }],
    ]);
  });

  it('grants a folder already registered on the computer by its id', async () => {
    const fake = new FakeHost();
    fake.methods.set('grantCreate', () => ({ grant: grant('site') }));

    await botSettings(client(fake), slug).authorizeFolder('/Users/ada/site', 'ws-site');

    expect(calls(fake)).toEqual([['grantCreate', { slug, workspaceId: 'ws-site' }]]);
  });

  it('reads and sets Full access with its risk acknowledgement and scope', async () => {
    const fake = new FakeHost();
    fake.methods.set('assignmentAccessGet', () => ({
      preset: { botSlug: slug, mode: 'workspace-write', revision: 1 },
    }));
    fake.methods.set('assignmentAccessSet', (args) => ({
      preset: { botSlug: slug, mode: args['mode'], scope: args['scope'], revision: 2 },
    }));
    const host = client(fake);

    expect(await loadAssignmentAccess(host, slug)).toEqual({
      mode: 'workspace-write',
      scope: 'chat',
      revision: 1,
    });
    expect(await setAssignmentAccess(host, slug, 'danger-full-access', true)).toEqual({
      mode: 'danger-full-access',
      scope: 'chat',
      revision: 2,
    });
    expect(
      (await setAssignmentAccess(host, slug, 'danger-full-access', true, 'assignments')).scope,
    ).toBe('assignments');
    await setAssignmentAccess(host, slug, 'workspace-write', false);

    expect(calls(fake)).toEqual([
      ['assignmentAccessGet', { slug }],
      ['assignmentAccessSet', { slug, mode: 'danger-full-access', acknowledgeRisk: true }],
      [
        'assignmentAccessSet',
        { slug, mode: 'danger-full-access', acknowledgeRisk: true, scope: 'assignments' },
      ],
      ['assignmentAccessSet', { slug, mode: 'workspace-write', acknowledgeRisk: false }],
    ]);
  });

  it('refuses an access answer for another Bot', async () => {
    const fake = new FakeHost();
    fake.methods.set('assignmentAccessGet', () => ({
      preset: { botSlug: 'grace', mode: 'workspace-write', revision: 1 },
    }));

    await expect(loadAssignmentAccess(client(fake), slug)).rejects.toThrow(
      'assignmentAccessGet returned no access setting.',
    );
  });

  it('reads and sets the auto approval template', async () => {
    const fake = new FakeHost();
    fake.methods.set('approvalTemplates', () => ({
      templates: [
        { name: 'cautious', title: 'Cautious', description: 'Reads and plans.' },
        { name: 'get-work-done', title: 'Get the work done', description: 'Keeps going.' },
        { name: 'broken' },
      ],
      selected: 'cautious',
    }));
    fake.methods.set('botApprovalTemplateSet', () => ({ bot: { slug } }));
    const host = client(fake);

    const templates = await loadApprovalTemplates(host, slug);
    expect(templates.selected).toBe('cautious');
    expect(templates.templates.map((template) => template.name)).toEqual([
      'cautious',
      'get-work-done',
    ]);

    await setApprovalTemplate(host, slug, 'get-work-done');
    await setApprovalTemplate(host, slug, null);
    expect(calls(fake)).toEqual([
      ['approvalTemplates', { slug }],
      ['botApprovalTemplateSet', { slug, template: 'get-work-done' }],
      ['botApprovalTemplateSet', { slug, template: null }],
    ]);

    fake.methods.set('botApprovalTemplateSet', () => ({ bot: { slug: 'grace' } }));
    await expect(setApprovalTemplate(host, slug, null)).rejects.toThrow(
      'botApprovalTemplateSet did not return the Bot.',
    );
  });
});

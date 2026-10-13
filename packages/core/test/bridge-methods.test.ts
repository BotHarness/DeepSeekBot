import { seededBannerRecipe } from '@botharness/pixel-banner';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { seededAvatarFor } from '../src/bots/avatar-appearance.js';
import { fallbackPrimaryColor, resolveBotPrimaryColor } from '../src/bots/primary-color.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

import { createChannelStore, type ChannelStore } from '../src/channels/store.js';
import type { MemoryService } from '../src/memory/service.js';
import {
  createUsageProjection,
  type UsageProjection,
  type DshUsageSessionLogReader,
} from '../src/usage/usage.js';
import { createModelPresetStore } from '../src/models/presets.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import type { BotRuntime } from '../src/runtime/bot-runtime.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';

const roots: string[] = [];
const modelOwners: OperationalDatabaseOwner[] = [];

describe('composer recovery reference validation', () => {
  it('uses current Human-visible reply and attachment facts without accepting draft text', async () => {
    const { channels, attachments, methods } = setup();
    const channel = channels.getOrCreateDm('ada', 'Ada')!;
    const sent = await methods.channelSend({ channelId: channel.id, body: 'reply target' });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error('send failed');
    const ref = await attachments.upload({
      name: 'note.txt',
      data: (async function* () {
        yield new TextEncoder().encode('file');
      })(),
    });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        replyTo: sent.value.message.id,
        attachments: [ref],
      }),
    ).toMatchObject({
      ok: true,
      value: { reply: { id: sent.value.message.id }, attachments: [ref] },
    });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        replyTo: 'deleted',
        attachments: [
          { hash: 'sha256:' + '0'.repeat(64), name: 'gone.txt', mime: 'text/plain', size: 0 },
        ],
      }),
    ).toEqual({ ok: true, value: { attachments: [null] } });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        attachments: [],
        text: 'private unsent input',
      }).ok,
    ).toBe(false);
    expect(methods.composerValidate({ channelId: 'missing', attachments: [] }).ok).toBe(false);
  });
});

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function setup(
  _sessionSummaries: unknown[] = [],
  botIds: string[] = ['ada'],
  runtimeFactory?: (channels: ChannelStore) => BotRuntime,
  ownership = createTestOwnership(),
  grants?: WorkspaceGrantStore,
  developerMode?: { set(enabled: boolean): void },
  memory?: MemoryService,
  usage?: UsageProjection,
  modelCatalog?: ModelCatalog,
  readUsageSessionLog?: DshUsageSessionLogReader,
) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const modelOwner = mountOperationalDatabase({
    dshHome: root,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  modelOwners.push(modelOwner);
  const registry = createTestRegistry({ rootDir: root, database: modelOwner });
  const modelPresets = createModelPresetStore({ rootDir: root, database: modelOwner });
  const states = createBotStateTracker();
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const channels = createChannelStore({
    rootDir: join(root, 'channels'),
    attachments,
    now: tickingNow(),
    isBotActive: (slug) => registry.get(slug) !== undefined && registry.get(slug)?.paused !== true,
    botDisplayName: (slug) => registry.get(slug)?.displayName,
  });
  let botIdIndex = 0;
  return {
    root,
    registry,
    modelPresets,
    modelOwner,
    states,
    channels,
    attachments,
    methods: createBridgeMethods({
      registry,
      modelPresets,
      ...(modelCatalog === undefined ? {} : { modelCatalog }),
      ...(modelCatalog === undefined
        ? {}
        : { modelReadiness: createModelRouteReadiness(registry, modelCatalog) }),
      states,
      channels,
      attachments,
      ownership,
      roster: createTestRosterStore(),
      ...(grants === undefined ? {} : { grants }),
      ...(memory === undefined ? {} : { memory }),
      ...(usage === undefined ? {} : { usage }),
      ...(readUsageSessionLog === undefined ? {} : { readUsageSessionLog }),
      ...(runtimeFactory === undefined ? {} : { runtime: runtimeFactory(channels) }),
      ...(developerMode === undefined ? {} : { developerMode }),
      createBotId: () => botIds[botIdIndex++] ?? 'bot-test-' + botIdIndex,
    }),
  };
}

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('scopes Group authorization to a current member and the confirmed path', async () => {
    const grant = {
      id: 'grant',
      botSlug: 'ada',
      workspaceId: 'project',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: '',
    };
    const create = vi.fn<WorkspaceGrantStore['create']>(async (_slug, _workspace, options) => {
      options?.validate();
      options?.onCreated();
      return grant;
    });
    const grants: WorkspaceGrantStore = {
      list: () => [],
      create,
      revoke: () => grant,
      requireActive: () => grant,
      setOrchestratorWrite: () => grant,
      availableWorkspaces: () => [{ id: 'project', path: '/project', title: 'Project' }],
    };
    const { registry, channels, methods } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      grants,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = channels.createGroup({ name: 'Team', members: ['ada'] });
    const input = {
      slug: 'ada',
      workspaceId: 'project',
      scope: { channelId: group.id, path: '/project' },
    };
    expect(await methods.grantCreate({ ...input, slug: 'bea' })).toMatchObject({ ok: false });
    expect(
      await methods.grantCreate({ ...input, scope: { ...input.scope, path: '/other' } }),
    ).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(await methods.grantCreate(input)).toMatchObject({
      ok: true,
      value: { grant, created: true },
    });
    expect(create).toHaveBeenCalledTimes(1);
    registry.setPaused('ada', true);
    expect(await methods.grantCreate(input)).toMatchObject({ ok: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('bounds read-only Session usage to the current DM Bot and rejects Group and missing scopes', async () => {
    const ownership = createTestOwnership({
      first: { botSlug: 'ada', rootRole: 'orchestrator' },
      assignment: { botSlug: 'ada', rootRole: 'assignment' },
      other: { botSlug: 'outsider', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'latest',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-12T00:00:00.000Z',
    });
    const usageHome = mkdtempSync(join(tmpdir(), 'botharness-session-usage-'));
    roots.push(usageHome);
    const owner = mountOperationalDatabase({
      dshHome: usageHome,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    modelOwners.push(owner);
    const usage = createUsageProjection({ ownership, database: owner });
    const read = vi.fn(async () => ({ events: [], inheritedEventCount: 0 }));
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      ownership,
      undefined,
      undefined,
      undefined,
      usage,
      undefined,
      read,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const result = await methods.profileSessionUsage({ channelId: dm.id, slug: 'outsider' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected scoped usage');
    expect(result.value.slug).toBe('ada');
    expect(result.value.weeks).toBe(26);
    expect(result.value.rows.map((row) => row.sessionId)).toEqual(['latest', 'assignment']);
    expect(read.mock.calls).toHaveLength(2);
    const group = channels.createGroup({ name: 'Group', members: ['ada'] });
    expect((await methods.profileSessionUsage({ channelId: group.id })).ok).toBe(false);
    expect((await methods.profileSessionUsage({ channelId: 'missing' })).ok).toBe(false);
    expect((await methods.profileSessionUsage({})).ok).toBe(false);
    expect(read.mock.calls).toHaveLength(2);
  });
  it('does not expand pasted text, DM selections, empty previews or forged recipient lists', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'outsider', displayName: 'Outsider' });
    const group = channels.createGroup({ name: 'Bounded', members: ['ada'] });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    const selection = { start: 0, end: 9, label: 'All Bots', preview: preview.value };
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: '@All Bots check',
        allBotMention: selection,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots check',
        allBotMention: {
          ...selection,
          preview: { ...preview.value, recipients: [{ botSlug: 'outsider', label: 'Outsider' }] },
        },
      }),
    ).toMatchObject({ ok: false });
    registry.setPaused('ada', true);
    const empty = methods.channelAllBotPreview({ channelId: group.id });
    if (!empty.ok) throw new Error('Expected empty preview');
    expect(empty.value.recipients).toEqual([]);
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots check',
        allBotMention: { ...selection, preview: empty.value },
      }),
    ).toMatchObject({ ok: false });
    expect(
      await methods.channelSend({ channelId: group.id, body: '@All Bots plain text' }),
    ).toMatchObject({ ok: true, value: { message: { body: '@All Bots plain text' } } });
    expect(channels.readMessages(group.id)).toHaveLength(1);
    expect(channels.readMessages(group.id)[0]?.mentions).toBeUndefined();
  });
  it('rejects All Bots when eligibility changes while the Channel commit is queued', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = channels.createGroup({ name: 'Queued preview', members: ['ada'] });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    const sending = methods.channelSend({
      channelId: group.id,
      body: '@All Bots check',
      allBotMention: { start: 0, end: 9, label: 'All Bots', preview: preview.value },
    });
    registry.setPaused('ada', true);
    expect(await sending).toMatchObject({ ok: false, error: { code: 'all-bot-preview-changed' } });
    expect(channels.readMessages(group.id)).toEqual([]);
  });
  it('rejects a stale All Bots preview even when the new recipient count is unchanged', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = channels.createGroup({ name: 'Stale', members: ['ada', 'bea'] });
    registry.setPaused('bea', true);
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    registry.setPaused('bea', false);
    registry.setPaused('ada', true);
    const result = await methods.channelSend({
      channelId: group.id,
      body: '@All Bots check',
      allBotMention: { start: 0, end: 9, label: 'All Bots', preview: preview.value },
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'all-bot-preview-changed',
        details: { preview: { recipients: [{ botSlug: 'bea', label: 'Bea' }] } },
      },
    });
    expect(channels.readMessages(group.id)).toEqual([]);
    expect(methods.channelAllBotPreview({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { recipients: [{ botSlug: 'bea', label: 'Bea' }] },
    });
  });
  it('Human selects all active joined Bots once and sends ordinary explicit mentions', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    registry.create({ slug: 'archived', displayName: 'Archived' });
    registry.setPaused('archived', true);
    registry.create({ slug: 'outsider', displayName: 'Outsider' });
    const group = channels.createGroup({ name: 'All Bots', members: ['bea', 'archived', 'ada'] });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    expect(preview).toMatchObject({
      ok: true,
      value: {
        recipients: [
          { botSlug: 'ada', label: 'Ada' },
          { botSlug: 'bea', label: 'Bea' },
        ],
      },
    });
    if (!preview.ok) throw new Error('Expected preview');
    const result = await methods.channelSend({
      channelId: group.id,
      body: '@所有 Bot 请核对',
      allBotMention: { start: 0, end: 7, label: '所有 Bot', preview: preview.value },
      messageId: 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        message: {
          body: '@Ada @Bea 请核对',
          mentions: [
            { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
            { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
          ],
        },
      },
    });
    expect(channels.readMessages(group.id)).toHaveLength(1);
  });
  it('queries the same versioned Host activity used by the stream', () => {
    const { registry, states, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    states.setSessionState('ada', 'owned', 'thinking');
    const first = methods.activitySnapshot({});
    expect(first).toMatchObject({
      ok: true,
      value: { revision: 1, bots: [{ slug: 'ada', state: 'thinking' }] },
    });
    states.setSessionState('ada', 'owned', 'working');
    const second = methods.activitySnapshot({});
    expect(second).toMatchObject({
      ok: true,
      value: { revision: 2, bots: [{ slug: 'ada', state: 'working' }] },
    });
    expect(first.ok && first.value.generation).toBe(second.ok && second.value.generation);
  });

  it.each(['.', '..', ' . ', ' .. '])(
    'refuses reserved Browser profile %s before writing or resetting work',
    (profile) => {
      const h = setup();
      h.registry.create({ slug: 'ada', displayName: 'Ada' });
      h.registry.setBrowserProfile('ada', 'work.v2');
      const before = h.registry.get('ada');
      const write = vi.spyOn(h.registry, 'setBrowserProfile');
      const changed = vi.fn();
      const methods = createBridgeMethods({
        registry: h.registry,
        states: h.states,
        channels: h.channels,
        ownership: createTestOwnership(),
        roster: createTestRosterStore(),
        browserProfile: { changed },
      });
      expect(methods.browserProfileSet({ slug: 'ada', profile })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input', message: expect.stringMatching(/reserved/) },
      });
      expect(write).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      expect(h.registry.get('ada')).toEqual(before);
      expect(createTestRegistry({ rootDir: h.root }).get('ada')).toEqual(before);
    },
  );

  it('keeps valid dotted Browser profile names and default aliases', () => {
    const h = setup();
    h.registry.create({ slug: 'ada', displayName: 'Ada' });
    for (const [profile, expected] of [
      [' work.v2 ', 'work.v2'],
      ['.work', '.work'],
      ['work..', 'work..'],
      [' default ', undefined],
      ['', undefined],
    ]) {
      expect(h.methods.browserProfileSet({ slug: 'ada', profile }).ok).toBe(true);
      expect(h.registry.get('ada')?.browserProfile).toBe(expected);
    }
  });

  it('shows Assignment-default failure in Profile while the Orchestrator route still works', async () => {
    const working = { provider: 'selected-provider', model: 'working' };
    const missing = { provider: 'selected-provider', model: 'missing' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.model === 'missing') throw new Error('Assignment model is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.applyModelPreset(
      'ada',
      modelPresets.create({
        name: 'Broken Assignment default',
        orchestrator: working,
        assignmentDefault: missing,
      }),
    );
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: {
        plan: { orchestrator: working, assignmentDefault: missing },
        repair: {
          code: 'route-unavailable',
          message: expect.stringContaining('Assignment model is unavailable'),
        },
      },
    });
    const readiness = createModelRouteReadiness(registry, catalog);
    await expect(readiness.prepare('ada', 'orchestrator')).resolves.toBeUndefined();
    await expect(readiness.prepare('ada', 'assignment')).rejects.toThrow(
      'select an available Model Preset',
    );
    const preset = modelPresets.create({
      name: 'Repaired',
      orchestrator: working,
      assignmentDefault: working,
    });
    await methods.modelPresetApply({ slug: 'ada', presetId: preset.id });
    const repaired = await methods.modelPlan({ slug: 'ada' });
    if (!repaired.ok) throw new Error('Profile repair query failed');
    expect(repaired.value.repair).toBeUndefined();
    await expect(readiness.prepare('ada', 'assignment')).resolves.toBeUndefined();
  });
  it('migrates an unambiguous legacy model through the public Profile query and preserves its Agent preset', async () => {
    const catalog: ModelCatalog = {
      list: async () => [
        {
          provider: 'only-provider',
          providerName: 'Only',
          model: 'legacy',
          modelName: 'Legacy',
          efforts: [],
        },
      ],
      validate: async () => undefined,
    };
    const { root, registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada', model: 'legacy', preset: 'standard' });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          orchestrator: { provider: 'only-provider', model: 'legacy' },
          assignmentDefault: { provider: 'only-provider', model: 'legacy' },
        },
      },
    });
    const reopened = createTestRegistry({ rootDir: root }).get('ada');
    expect(reopened?.preset).toBe('standard');
    expect(reopened?.model).toBeUndefined();
    expect(reopened?.modelPlan?.revision).toBe(1);
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1 } },
    });
  });

  it.each([
    ['legacy-ambiguous', ['one', 'two']],
    ['legacy-missing', []],
  ] as const)('keeps unresolved legacy models repairable: %s', async (code, providers) => {
    const catalog: ModelCatalog = {
      list: async () =>
        providers.map((provider) => ({
          provider,
          providerName: provider,
          model: 'legacy',
          modelName: 'Legacy',
          efforts: [],
        })),
      validate: async () => {
        throw new Error('A guessed provider must not be validated');
      },
    };
    const { registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada', model: 'legacy', preset: 'standard' });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { repair: { code, legacyModel: 'legacy' } },
    });
    expect(registry.get('ada')?.model).toBe('legacy');
    expect(registry.get('ada')?.modelPlan).toBeUndefined();
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).rejects.toThrow('select a Model Preset');
  });

  it('keeps an unavailable selected route until Human applies a working preset', async () => {
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.model === 'missing') throw new Error('Credential is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const missing = { provider: 'selected-provider', model: 'missing' };
    registry.applyModelPreset(
      'ada',
      modelPresets.create({
        name: 'Unavailable',
        orchestrator: missing,
        assignmentDefault: missing,
      }),
    );
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { orchestrator: missing }, repair: { code: 'route-unavailable' } },
    });
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).rejects.toThrow('Credential is unavailable');
    const working = { provider: 'selected-provider', model: 'working' };
    const preset = modelPresets.create({
      name: 'Repaired',
      orchestrator: working,
      assignmentDefault: working,
    });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: preset.id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 2, orchestrator: working } },
    });
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { orchestrator: working } },
    });
    expect((await methods.modelPlan({ slug: 'ada' })).ok).toBe(true);
    await expect(
      createModelRouteReadiness(registry, catalog).prepare('ada', 'orchestrator'),
    ).resolves.toBeUndefined();
  });

  it('saves a Bot-specific Assignment model set and rejects stale or unsupported choices', async () => {
    const flash = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const pro = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        const allowed =
          route.model === 'flash' ? ['high', 'low'] : route.model === 'pro' ? ['off'] : [];
        if (route.provider !== 'deepseek' || !allowed.includes(route.reasoningEffort ?? ''))
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods, modelPresets } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const preset = modelPresets.create({
      name: 'High',
      orchestrator: flash,
      assignmentDefault: pro,
    });
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: preset.id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1 } },
    });
    const assignmentModels = [
      {
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['high', 'low'],
        defaultEffort: 'low',
      },
      { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
    ];
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 1,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: { revision: 2, sourcePresetId: '', assignmentDefault: pro, assignmentModels },
      },
    });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 1,
        assignmentDefault: flash,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanAssignmentsSet({
        slug: 'ada',
        expectedRevision: 2,
        assignmentDefault: pro,
        assignmentModels: [
          {
            provider: 'deepseek',
            model: 'flash',
            allowedEfforts: ['ultra'],
            defaultEffort: 'ultra',
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).toMatchObject({
      revision: 2,
      assignmentModels,
    });
  });

  it('sets a Bot Model Plan directly without a preset and rejects stale revisions', async () => {
    const flash = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const pro = { provider: 'deepseek', model: 'pro' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (route.provider !== 'deepseek' || !['flash', 'pro'].includes(route.model))
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const assignmentModels = [
      { provider: 'deepseek', model: 'pro', allowedEfforts: [''], defaultEffort: '' },
    ];
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 0,
        orchestrator: flash,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 1,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: flash,
          assignmentDefault: pro,
          assignmentModels,
        },
      },
    });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 0,
        orchestrator: pro,
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 1,
        orchestrator: { provider: 'other', model: 'x' },
        assignmentDefault: pro,
        assignmentModels,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.modelPlan).toMatchObject({
      revision: 1,
      orchestrator: flash,
    });
  });

  it('preserves a template model set when an older editor omits the choices', async () => {
    const flash = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const pro = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const choices = [
      { provider: 'deepseek', model: 'flash', allowedEfforts: ['low'], defaultEffort: 'low' },
      { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
    ];
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (
          route.provider !== 'deepseek' ||
          (route.model === 'flash' && route.reasoningEffort !== 'low') ||
          (route.model === 'pro' && route.reasoningEffort !== 'off') ||
          !['flash', 'pro'].includes(route.model)
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { methods } = setup(
      [],
      [],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    const created = await methods.modelPresetCreate({
      name: 'Choices',
      orchestrator: flash,
      assignmentDefault: pro,
      assignmentModels: choices,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.preset.id;
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Renamed choices',
        orchestrator: flash,
        assignmentDefault: flash,
      }),
    ).toMatchObject({
      ok: true,
      value: { preset: { revision: 2, assignmentDefault: flash, assignmentModels: choices } },
    });
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 2,
        name: 'Invalid default',
        orchestrator: flash,
        assignmentDefault: { ...flash, reasoningEffort: 'high' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('validates routes and applies independent named Model Preset snapshots to two Bots', async () => {
    const valid = { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' };
    const catalog: ModelCatalog = {
      list: async () => [
        {
          provider: 'deepseek',
          providerName: 'DeepSeek',
          model: 'deepseek-chat',
          modelName: 'DeepSeek Chat',
          efforts: [{ id: 'high', name: 'High' }],
        },
      ],
      validate: async (route) => {
        if (
          route.provider !== valid.provider ||
          route.model !== valid.model ||
          route.reasoningEffort !== valid.reasoningEffort
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { registry, methods, modelPresets } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    expect(
      await methods.modelPresetCreate({
        name: 'Invalid',
        orchestrator: { provider: 'missing', model: 'missing' },
        assignmentDefault: valid,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(modelPresets.list()).toHaveLength(0);
    const created = await methods.modelPresetCreate({
      name: 'Deep thinking',
      orchestrator: valid,
      assignmentDefault: valid,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await methods.modelPresetApply({
      slug: 'ada',
      presetId: created.value.preset.id,
    });
    const second = await methods.modelPresetApply({
      slug: 'bea',
      presetId: created.value.preset.id,
    });
    expect(first).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: valid } },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: valid } },
    });
    expect(registry.get('ada')?.modelPlan).not.toBe(registry.get('bea')?.modelPlan);
    expect(
      await methods.modelPresetApply({ slug: 'ada', presetId: created.value.preset.id }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 2 } } });
    expect(registry.get('bea')?.modelPlan?.revision).toBe(1);
    expect(await methods.modelPlan({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { plan: { revision: 2, sourcePresetName: 'Deep thinking' } },
    });
  });
  it('edits a template for future applications and keeps custom Bot snapshots independent across restart', async () => {
    const high = { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'low' };
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async (route) => {
        if (
          route.provider !== high.provider ||
          route.model !== high.model ||
          !['high', 'low'].includes(route.reasoningEffort ?? '')
        )
          throw new Error('Selected route is unavailable');
      },
    };
    const { root, registry, methods, modelPresets, modelOwner } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const created = await methods.modelPresetCreate({
      name: 'High intelligence',
      orchestrator: high,
      assignmentDefault: high,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.preset.id;
    expect(await methods.modelPresetApply({ slug: 'ada', presetId: id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, orchestrator: high } },
    });

    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Economy',
        orchestrator: low,
        assignmentDefault: low,
      }),
    ).toMatchObject({ ok: true, value: { preset: { id, revision: 2, name: 'Economy' } } });
    expect(
      await methods.modelPresetUpdate({
        id,
        expectedRevision: 1,
        name: 'Stale edit',
        orchestrator: high,
        assignmentDefault: high,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-input', message: expect.stringContaining('changed') },
    });
    expect(modelPresets.get(id)).toMatchObject({ revision: 2, name: 'Economy', orchestrator: low });
    expect(registry.get('ada')?.modelPlan).toMatchObject({
      revision: 1,
      sourcePresetName: 'High intelligence',
      orchestrator: high,
    });
    expect(await methods.modelPresetApply({ slug: 'bea', presetId: id })).toMatchObject({
      ok: true,
      value: { plan: { revision: 1, sourcePresetName: 'Economy', orchestrator: low } },
    });
    expect(await methods.modelPlanCustomize({ slug: 'bea', orchestrator: high })).toMatchObject({
      ok: true,
      value: {
        plan: {
          revision: 2,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: high,
          assignmentDefault: low,
        },
      },
    });
    expect(modelPresets.get(id)).toMatchObject({ revision: 2, orchestrator: low });
    expect(registry.get('ada')?.modelPlan?.revision).toBe(1);
    expect(
      await methods.modelPlanCustomize({
        slug: 'ada',
        orchestrator: { ...high, model: 'missing' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(registry.get('ada')?.modelPlan?.revision).toBe(1);

    const reopened = createTestRegistry({ rootDir: root });
    expect(reopened.get('ada')?.modelPlan).toMatchObject({ revision: 1, orchestrator: high });
    expect(reopened.get('bea')?.modelPlan).toMatchObject({
      revision: 2,
      sourcePresetId: '',
      orchestrator: high,
    });
    expect(createModelPresetStore({ rootDir: root, database: modelOwner }).get(id)).toMatchObject({
      revision: 2,
      orchestrator: low,
    });
  });
  it('rejects stale customization when a preset is applied during model validation', async () => {
    const high = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    let pauseValidation = false;
    let signalValidation: () => void = () => undefined;
    let releaseValidation: () => void = () => undefined;
    const validationStarted = new Promise<void>((resolve) => {
      signalValidation = resolve;
    });
    const validationGate = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    const catalog: ModelCatalog = {
      list: async () => [],
      validate: async () => {
        if (!pauseValidation) return;
        pauseValidation = false;
        signalValidation();
        await validationGate;
      },
    };
    const { registry, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const original = await methods.modelPresetCreate({
      name: 'Original',
      orchestrator: high,
      assignmentDefault: high,
    });
    const replacement = await methods.modelPresetCreate({
      name: 'Replacement',
      orchestrator: low,
      assignmentDefault: low,
    });
    if (!original.ok || !replacement.ok) throw new Error('Could not prepare model presets');
    await methods.modelPresetApply({ slug: 'ada', presetId: original.value.preset.id });

    pauseValidation = true;
    const customization = methods.modelPlanCustomize({ slug: 'ada', orchestrator: high });
    await validationStarted;
    expect(
      await methods.modelPresetApply({ slug: 'ada', presetId: replacement.value.preset.id }),
    ).toMatchObject({ ok: true, value: { plan: { revision: 2, orchestrator: low } } });
    releaseValidation();
    expect(await customization).toMatchObject({
      ok: false,
      error: { code: 'invalid-input', message: expect.stringContaining('changed') },
    });
    expect(registry.get('ada')?.modelPlan).toMatchObject({
      revision: 2,
      sourcePresetId: replacement.value.preset.id,
      orchestrator: low,
    });
  });
  it('commits only a Grant-backed typed resolution for this Bot DM and retries it idempotently', async () => {
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: '2026-09-26T00:00:00.000Z',
    };
    let revoked = false;
    const grants: WorkspaceGrantStore = {
      list: (slug) =>
        slug === 'ada' ? [{ ...grant, ...(revoked ? { revokedAt: grant.createdAt } : {}) }] : [],
      create: async () => grant,
      revoke: () => grant,
      requireActive: () => grant,
      setOrchestratorWrite: (_slug, _id, enabled) => ({ ...grant, orchestratorWrite: enabled }),
      availableWorkspaces: () => [],
    };
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      grants,
    );
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    await channels.appendMessage(dm.id, {
      id: 'grant-request-1',
      at: '2026-09-26T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Please grant this workspace.',
      grantRequest: true,
    });
    const payload = {
      channelId: dm.id,
      messageId: 'human-25f4609a-2aee-446a-a5d9-ea53607aba13',
      body: 'Workspace authorized.',
      replyTo: 'grant-request-1',
      grantRequestResolution: { requestMessageId: 'grant-request-1', grantId: 'grant-1' },
    };
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: { ...payload.grantRequestResolution, grantId: 'unknown' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: { ...payload.grantRequestResolution, requestMessageId: 'missing' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: '已授权工作区「Project」，请继续处理之前的事项。',
        replyTo: 'grant-request-1',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: 'I AUTHORIZED WORKSPACE “Project”; please continue.',
        replyTo: 'grant-request-1',
      }),
    ).toMatchObject({ ok: true });
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(channels.message(dm.id, payload.messageId)?.grantRequestResolution).toEqual(
      payload.grantRequestResolution,
    );
    revoked = true;
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({
        ...payload,
        messageId: 'human-35f4609a-2aee-446a-a5d9-ea53607aba13',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('keeps Bot-to-Bot DMs inspectable but rejects Human sends and renames', async () => {
    const { registry, channels, methods } = setup([], ['ada', 'bea']);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const dm = channels.getOrCreateBotDm('ada', 'bea', 'Ada · Bea')!;
    expect(methods.channelMessages({ channelId: dm.id })).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({ channelId: dm.id, body: 'Human interjection' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.channelRename({ channelId: dm.id, name: 'Changed' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(channels.readMessages(dm.id)).toEqual([]);
  });

  it('requires selected joined Bot identities and preserves committed retry identity', async () => {
    const wakes: string[] = [];
    const { registry, channels, methods } = setup([], ['ada', 'bea'], () => ({
      admitGroupMessage(channelId, messageId) {
        wakes.push(channelId + ':' + messageId);
      },
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: true as const, settled: Promise.resolve() }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    expect(registry.create({ slug: 'ada', displayName: 'Alex' }).ok).toBe(true);
    expect(registry.create({ slug: 'bea', displayName: 'Alex' }).ok).toBe(true);
    const group = channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
    const body = '@Alex @Alex hello';
    const payload = {
      channelId: group.id,
      messageId: 'human-25f4609a-2aee-446a-a5d9-ea53607aba13',
      body,
      mentions: [
        { botSlug: 'ada', label: 'Alex', start: 0, end: 5 },
        { botSlug: 'bea', label: 'Alex', start: 6, end: 11 },
      ],
    };
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    expect(channels.readMessages(group.id)).toHaveLength(1);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    registry.setPaused('bea', true);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'bea', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });

    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'outsider', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'ada', label: 'wrong', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await methods.channelSend({ channelId: group.id, body: '@Alex hello' })).toMatchObject({
      ok: true,
    });
    expect(wakes).toHaveLength(2);
    expect(channels.readMessages(group.id)).toHaveLength(2);
  });

  it('admits blank attachment-only DMs and rejects forged refs', async () => {
    const admitted: string[] = [];
    const { channels, attachments, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        admitted.push(input.body);
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm('ada', 'Ada');
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('hello');
      })(),
      name: 'note.txt',
    });
    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: '   ',
      attachments: [ref],
    });
    expect(sent).toMatchObject({ ok: true, value: { message: { attachments: [ref] } } });
    const empty = await methods.channelSend({ channelId: 'dm-ada', body: '', attachments: [ref] });
    expect(empty.ok).toBe(true);
    expect(admitted).toEqual(['[Attachments: note.txt]', '[Attachments: note.txt]']);
    const bad = await methods.channelSend({
      channelId: 'dm-ada',
      body: '',
      attachments: [{ ...ref, name: 'forged.txt' }],
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(channels.readMessages('dm-ada')).toHaveLength(2);
  });

  it('persists a Human Memory branch choice and rejects a conflicting retry', async () => {
    const { channels, methods } = setup();
    channels.getOrCreateDm('ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'Switch Memory to history',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
      memorySwitchTarget: 'history',
    };
    const first = await methods.channelSend(payload);
    expect(first).toMatchObject({
      ok: true,
      value: { message: { author: { kind: 'human' }, memorySwitchTarget: 'history' } },
    });
    expect(channels.readMessages('dm-ada')[0]?.memorySwitchTarget).toBe('history');
    expect(await methods.channelSend(payload)).toEqual(first);
    await expect(
      methods.channelSend({ ...payload, memorySwitchTarget: 'main' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    await expect(
      methods.channelSend({ ...payload, memorySwitchTarget: '' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('deduplicates one Human client message id before a second runtime admission', async () => {
    let admissions = 0;
    const { channels, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage() {
        admissions += 1;
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm('ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'only once',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
    };
    const [first, duplicate] = await Promise.all([
      methods.channelSend(payload),
      methods.channelSend(payload),
    ]);
    expect(duplicate).toEqual(first);
    expect(channels.readMessages('dm-ada')).toHaveLength(1);
    expect(admissions).toBe(1);
    await expect(methods.channelSend({ ...payload, body: 'different' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('lists PersonaBots with their aggregate state', () => {
    const { registry, states, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究'],
      description: '数学与计算',
      workspaces: ['/tmp/ada'],
    });
    states.setSessionState('ada', 'session-1', 'working');

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            slug: 'ada',
            displayName: 'Ada',
            roles: ['研究'],
            description: '数学与计算',
            aggregateState: 'working',
            workspaces: ['/tmp/ada'],
            createdAt: expect.any(String),
            banner: { recipe: expect.objectContaining({ seed: expect.any(Number) }) },
            avatarSeed: 2,
            standingLimits: { soul: 5000, coreMemory: 3000 },
          },
        ],
      },
    });
  });

  it('returns empty roles and omits description when the record has none', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'plain', displayName: 'Plain' });

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            slug: 'plain',
            displayName: 'Plain',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: expect.any(String),
            banner: { recipe: expect.objectContaining({ seed: expect.any(Number) }) },
            avatarSeed: 2,
            standingLimits: { soul: 5000, coreMemory: 3000 },
          },
        ],
      },
    });
  });

  it('carries role badges and description into the detail read model', () => {
    const { registry, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究'],
      description: '数学与计算',
    });

    const result = methods.get({ slug: 'ada' });

    expect(result.ok && result.value.bot).toMatchObject({
      roles: ['研究'],
      description: '数学与计算',
      memoryDir: registry.memoryDirFor('ada'),
    });
  });

  it('filters by display name or role badge, never by internal ID', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'hidden-ada', displayName: 'Ada Lovelace', roles: ['研究员'] });
    registry.create({ slug: 'hidden-bob', displayName: 'Bob' });

    const byName = methods.list({ query: 'love' });
    const byRole = methods.list({ query: '研究' });
    const byInternalId = methods.list({ query: 'hidden-bob' });

    expect(byName.ok && byName.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byRole.ok && byRole.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byInternalId.ok && byInternalId.value.bots).toEqual([]);
  });

  it('returns a structured not-found failure for unknown slugs', () => {
    const { methods } = setup();

    expect(methods.get({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });

  it('creates a bot with persona, profile fields and a custom avatar', () => {
    const { root, methods } = setup();

    const result = methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nBe kind.\n',
      roles: ['研究'],
      description: '数学与计算',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/ada'],
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          slug: 'ada',
          displayName: 'Ada',
          roles: ['研究'],
          description: '数学与计算',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          banner: { recipe: expect.objectContaining({ seed: expect.any(Number) }) },
          avatarSeed: 2,
          standingLimits: { soul: 5000, coreMemory: 3000 },
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(createTestRegistry({ rootDir: root }).get('ada')).toMatchObject({
      slug: 'ada',
      avatar: expect.stringMatching(/^data:image\/png;base64,/u),
      roles: ['研究'],
      description: '数学与计算',
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'SOUL.md'), 'utf8')).toBe(
      '# Ada\n\nBe kind.\n',
    );
  });

  it('reports a missing Git prerequisite without exposing a spawn error', () => {
    const { registry, methods } = setup();
    registry.create = () => ({ ok: false, reason: 'git-not-found', detail: 'spawn git ENOENT' });

    expect(methods.create({ displayName: 'No Git' })).toEqual({
      ok: false,
      error: {
        code: 'git-not-found',
        message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
      },
    });
    expect(registry.list()).toEqual([]);
  });
  it('creates a name-only bot with its Memory directory and no Persona file', () => {
    const { root, methods } = setup([], ['plain']);

    expect(methods.create({ displayName: 'Plain' }).ok).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory'))).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory', 'SOUL.md'))).toBe(false);
  });

  it('owns ID generation and reports malformed Human-facing fields', () => {
    const { root, methods } = setup([], ['bot-generated', 'bot-generated']);

    expect(methods.create({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 42 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 'Ada', roles: '研究员' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });

    const created = methods.create({ slug: 'caller-choice', displayName: 'Ada' });
    expect(created.ok && created.value.bot.slug).toBe('bot-generated');
    expect(createTestRegistry({ rootDir: root }).get('bot-generated')).toBeDefined();
    expect(existsSync(join(root, 'bot-generated', 'bot.json'))).toBe(false);
    expect(existsSync(join(root, 'caller-choice', 'bot.json'))).toBe(false);
    expect(methods.create({ displayName: '同名 Ada' })).toEqual({
      ok: false,
      error: { code: 'duplicate', message: 'PersonaBot already exists: bot-generated' },
    });
  });

  it('allows duplicate display names because mention identity stays on the generated ID', () => {
    const { methods } = setup([], ['bot-one', 'bot-two']);

    const first = methods.create({ displayName: '小研' });
    const second = methods.create({ displayName: '小研' });

    expect(first.ok && first.value.bot.slug).toBe('bot-one');
    expect(second.ok && second.value.bot.slug).toBe('bot-two');
  });

  it('updates editable fields and leaves persona untouched', () => {
    const { root, methods } = setup();
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nOriginal.\n',
      roles: ['old'],
    });

    const result = methods.update({
      slug: 'ada',
      patch: {
        displayName: 'Ada Lovelace',
        roles: ['   '],
        description: '数学与计算',
        model: 'deepseek-chat',
        preset: 'standard',
        workspaces: ['/srv/ada'],
        avatar:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
        persona: '# Evil\n',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          slug: 'ada',
          displayName: 'Ada Lovelace',
          roles: [],
          description: '数学与计算',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          banner: { recipe: expect.objectContaining({ seed: expect.any(Number) }) },
          avatarSeed: 2,
          standingLimits: { soul: 5000, coreMemory: 3000 },
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'SOUL.md'), 'utf8')).toBe(
      '# Ada\n\nOriginal.\n',
    );
  });

  it('stores per-Bot standing limits and returns to the defaults', () => {
    const { root, methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const updated = methods.standingLimitsSet({ slug: 'ada', soul: 8000, coreMemory: 1200 });

    expect(updated.ok && updated.value.bot.standingLimits).toEqual({
      soul: 8000,
      coreMemory: 1200,
    });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.standingLimits).toEqual({
      soul: 8000,
      coreMemory: 1200,
    });

    methods.standingLimitsSet({ slug: 'ada', soul: 5000, coreMemory: 3000 });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.standingLimits).toBeUndefined();
  });

  it('rejects standing limits outside the allowed range', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    for (const payload of [
      { slug: 'ada', soul: 499, coreMemory: 3000 },
      { slug: 'ada', soul: 5000, coreMemory: 50_001 },
      { slug: 'ada', soul: 5000.5, coreMemory: 3000 },
      { slug: 'ada', soul: '5000', coreMemory: 3000 },
    ]) {
      expect(methods.standingLimitsSet(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(
      methods.standingLimitsSet({ slug: 'missing', soul: 5000, coreMemory: 3000 }),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('rejects unknown or malformed updates', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.update({ slug: 'missing', patch: { roles: ['x'] } })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.update({ slug: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'patch is required' },
    });
    expect(methods.update({ slug: 'ada', patch: { displayName: '   ' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: { workspaces: 'nope' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: {} })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', displayName: 'Ada' } },
    });
    const limits = { code: 'invalid-input', message: 'tags or bio exceed the profile limits' };
    expect(methods.update({ slug: 'ada', patch: { description: 'b'.repeat(161) } })).toEqual({
      ok: false,
      error: limits,
    });
    expect(methods.update({ slug: 'ada', patch: { roles: ['x'.repeat(33)] } })).toEqual({
      ok: false,
      error: limits,
    });
    expect(
      methods.update({
        slug: 'ada',
        patch: { roles: Array.from({ length: 9 }, (_, i) => `t${i}`) },
      }),
    ).toEqual({ ok: false, error: limits });
    expect(
      methods.update({
        slug: 'ada',
        patch: { roles: ['Notes'], description: 'b'.repeat(160) },
      }),
    ).toMatchObject({ ok: true, value: { bot: { roles: ['Notes'] } } });
  });

  it('pauses and resumes a bot, exposing paused in the read model', () => {
    const { registry, methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const paused = methods.pause({ slug: 'ada' });
    expect(paused.ok && paused.value.bot.paused).toBe(true);
    expect(registry.get('ada')?.paused).toBe(true);
    const listed = methods.list({});
    expect(listed.ok && listed.value.bots[0]?.paused).toBe(true);

    const resumed = methods.resume({ slug: 'ada' });
    expect(resumed.ok && 'paused' in resumed.value.bot).toBe(false);
    expect(registry.get('ada')?.paused).toBeUndefined();

    expect(methods.pause({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.resume({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
  });

  it('lists, opens, and creates local channels with a latest-message projection', async () => {
    const { methods, registry } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channels({})).toEqual({
      ok: true,
      value: {
        channels: [
          expect.objectContaining({
            id: 'dm-ada',
            type: 'dm',
            name: 'Ada',
            members: ['ada'],
            botSlug: 'ada',
          }),
        ],
      },
    });

    const dm = methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    expect(dm.ok && dm.value.channel).toMatchObject({
      id: 'dm-ada',
      type: 'dm',
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
    });
    const again = methods.channelDm({ slug: 'ada' });
    expect(again.ok && again.value.channel.id).toBe('dm-ada');
    expect(again.ok && again.value.channel.name).toBe('Ada');

    await methods.channelSend({ channelId: 'dm-ada', body: '最新进展' });
    const dmList = methods.channels({});
    expect(dmList.ok && dmList.value.channels[0]?.latestMessage?.body).toBe('最新进展');

    const group = methods.channelCreate({ name: 'Design Team', members: ['ada', 'bob'] });
    expect(group.ok && group.value.channel).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      name: 'Design Team',
      members: ['ada', 'bob'],
    });
    const renamedGroup = methods.channelRename({
      channelId: 'group-design-team',
      name: '  Product Team  ',
    });
    expect(renamedGroup.ok && renamedGroup.value.channel.name).toBe('Product Team');
    expect(renamedGroup.ok && renamedGroup.value.bot).toBeUndefined();

    const renamedDm = methods.channelRename({ channelId: 'dm-ada', name: 'Ada Lovelace' });
    expect(renamedDm.ok && renamedDm.value.channel).toMatchObject({
      id: 'dm-ada',
      name: 'Ada Lovelace',
    });
    expect(renamedDm.ok && renamedDm.value.bot?.displayName).toBe('Ada Lovelace');
    expect(registry.get('ada')?.displayName).toBe('Ada Lovelace');
    const listed = methods.channels({});
    expect(listed.ok && listed.value.channels.map((channel) => channel.id)).toEqual([
      'group-design-team',
      'dm-ada',
    ]);
  });

  it('rejects malformed channel payloads with stable error codes', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channelDm({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.channelDm({ slug: 'Ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid slug: Ada' },
    });
    expect(methods.channelCreate({ members: [] })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelCreate({ name: 'Team', members: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'members must be an array of PersonaBot IDs' },
    });
    expect(methods.channelMessages({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelRename({ name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelRename({ channelId: 'dm-ada', name: '  ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelRename({ channelId: 'missing', name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: missing' },
    });
    expect(methods.channelMessages({ channelId: 'dm-missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-missing' },
    });
    expect(methods.channelMessages({ channelId: 'dm-ada', limit: 0 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'limit must be a positive integer' },
    });
    expect(await methods.channelSend({ channelId: 'dm-ada', body: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'body is required' },
    });
    expect(await methods.channelSend({ channelId: 'dm-nope', body: 'hi' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-nope' },
    });
  });

  it('rejects missing or cross-Channel reply targets before appending a human message', async () => {
    const { methods, channels } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    const group = methods.channelCreate({ name: 'Team', members: [] });
    expect(group.ok).toBe(true);
    const groupId = group.ok ? group.value.channel.id : '';
    const source = await methods.channelSend({ channelId: groupId, body: 'source' });
    expect(source.ok).toBe(true);
    const sourceId = source.ok ? source.value.message.id : '';

    const invalidTarget = {
      ok: false,
      error: { code: 'invalid-input', message: 'Reply target must exist in this Channel' },
    };
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'cross', replyTo: sourceId }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'missing', replyTo: 'unknown' }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'invalid', replyTo: '' }),
    ).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'replyTo must be a message id' },
    });
    expect(channels.revision('dm-ada')).toBe(0);

    const accepted = await methods.channelSend({
      channelId: groupId,
      body: 'answer',
      replyTo: sourceId,
    });
    expect(accepted.ok && accepted.value.message).toMatchObject({
      replyTo: sourceId,
      replyToPreview: { author: { kind: 'human' }, body: 'source' },
    });
  });

  it('records human messages locally and pages them newest-first', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });
    expect(first).toEqual({
      ok: true,
      value: {
        message: {
          id: expect.any(String),
          at: expect.any(String),
          author: { kind: 'human' },
          body: 'hello',
        },
      },
    });
    const second = await methods.channelSend({ channelId: 'dm-ada', body: 'again' });
    expect(second.ok).toBe(true);
    const third = await methods.channelSend({ channelId: 'dm-ada', body: 'third' });
    expect(third.ok).toBe(true);

    const page = methods.channelMessages({ channelId: 'dm-ada' });
    expect(page.ok && page.value.messages.map((message) => message.body)).toEqual([
      'third',
      'again',
      'hello',
    ]);

    const oldest = await methods.channelSend({ channelId: 'dm-ada', body: 'oldest' });
    expect(oldest.ok).toBe(true);
    const cursor = third.ok ? third.value.message.id : '';
    const older = methods.channelMessages({ channelId: 'dm-ada', before: cursor, limit: 2 });
    expect(older.ok && older.value.messages.map((message) => message.body)).toEqual([
      'again',
      'hello',
    ]);
  });

  it('sends a DM through the Bot runtime and exposes only Assignment read models', async () => {
    const handled: Array<{ channelId: string; messageId: string; body: string }> = [];
    let settled: Promise<void> = Promise.resolve();
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        handled.push(input);
        settled = (async () => {
          const reply = {
            id: 'bot-reply-1',
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: '已经完成发布状态核对。',
          };
          await channels.appendMessage(input.channelId, reply);
        })();
        return { admitted: true as const, settled };
      },
      listAssignments: () => [
        {
          sessionId: 'assignment-1',
          purpose: '核对发布状态',
          activity: 'idle' as const,
          latestReport: {
            state: 'completed' as const,
            summary: '发布状态正常',
            at: '2026-09-19T00:00:01.000Z',
          },
          createdAt: '2026-09-19T00:00:00.000Z',
          updatedAt: '2026-09-19T00:00:01.000Z',
        },
      ],
      getAssignment: (_slug, sessionId) =>
        sessionId === 'assignment-1'
          ? {
              sessionId,
              botSlug: 'ada',
              sourceEventId: 'source-1',
              purpose: '核对发布状态',
              activity: 'idle' as const,
              latestReport: {
                state: 'completed' as const,
                summary: '发布状态正常',
                at: '2026-09-19T00:00:01.000Z',
              },
              createdAt: '2026-09-19T00:00:00.000Z',
              updatedAt: '2026-09-19T00:00:01.000Z',
            }
          : undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: '请核对发布状态' });

    expect(sent.ok).toBe(true);
    expect(handled).toEqual([
      {
        channelId: 'dm-ada',
        messageId: expect.any(String),
        body: '请核对发布状态',
      },
    ]);
    const pending = methods.channelMessages({ channelId: 'dm-ada' });
    expect(pending.ok && pending.value.messages.map((message) => message.body)).toContain(
      '请核对发布状态',
    );

    await settled;
    const messages = methods.channelMessages({ channelId: 'dm-ada' });
    expect(messages.ok && messages.value.messages.map((message) => message.body)).toEqual([
      '已经完成发布状态核对。',
      '请核对发布状态',
    ]);
    expect(methods.assignments({ slug: 'ada' })).toEqual({
      ok: true,
      value: {
        assignments: [
          expect.objectContaining({
            sessionId: 'assignment-1',
            purpose: '核对发布状态',
            activity: 'idle',
          }),
        ],
      },
    });
    expect(methods.assignment({ slug: 'ada', sessionId: 'assignment-1' })).toEqual({
      ok: true,
      value: {
        assignment: expect.objectContaining({
          sessionId: 'assignment-1',
          sourceEventId: 'source-1',
        }),
      },
    });
  });

  it('returns from a DM send before the admitted Orchestrator turns settle', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const settledTurns: Promise<void>[] = [];
    const admitted: string[] = [];
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        admitted.push(input.body);
        const settled = (async () => {
          await gate;
          await channels.appendMessage(input.channelId, {
            id: `bot-reply-${admitted.length}`,
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: `reply-${input.body}`,
          });
        })();
        settledTurns.push(settled);
        return { admitted: true as const, settled };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({ channelId: 'dm-ada', body: 'first' });
    const second = await methods.channelSend({ channelId: 'dm-ada', body: 'second' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(admitted).toEqual(['first', 'second']);
    const before = methods.channelMessages({ channelId: 'dm-ada' });
    expect(before.ok && before.value.messages.map((message) => message.body)).toEqual([
      'second',
      'first',
    ]);

    release();
    await Promise.all(settledTurns);
    const after = methods.channelMessages({ channelId: 'dm-ada' });
    expect(after.ok && after.value.messages.map((message) => message.body)).toEqual([
      'reply-second',
      'reply-first',
      'second',
      'first',
    ]);
  });

  it('rejects an archived PersonaBot before committing a Human DM', async () => {
    const { methods, registry, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: false as const, reason: 'archived-bot' as const }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    registry.setPaused('ada', true);

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });

    expect(sent).toEqual({
      ok: false,
      error: { code: 'bot-archived', message: 'PersonaBot is archived: ada' },
    });
    expect(channels.readMessages('dm-ada')).toEqual([]);
  });

  it('reports a post-commit admission refusal without mislabeling a durable message as failed', async () => {
    const { methods, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: false as const, reason: 'runtime-closed' as const }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });

    expect(sent).toMatchObject({ ok: true, value: { message: { body: 'hello' } } });
    expect(channels.readMessages('dm-ada').map((message) => message.body)).toEqual(['hello']);
  });

  it('lists only root Sessions owned by the bot, preserving role and cwd evidence', () => {
    const ownership = createTestOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'assignment' },
      'session-3': { botSlug: 'bob', rootRole: 'assignment' },
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/srv/ada/'] });

    const result = methods.sessions({ slug: 'ada' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toEqual([
      expect.objectContaining({ sessionId: 'session-1', role: 'orchestrator' }),
      expect.objectContaining({ sessionId: 'session-2', role: 'assignment' }),
    ]);
    expect(result.value.sessions.map((session) => session.sessionId)).not.toContain('session-3');
  });

  it('projects each Assignment access snapshot independently of the Bot default', () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-safe': { botSlug: 'ada', rootRole: 'assignment' },
      'session-danger': { botSlug: 'ada', rootRole: 'assignment' },
    });
    const { methods } = setup(
      [],
      ['ada'],
      () => ({
        admitGroupMessage() {},
        admitBotDmMessage() {},
        admitGroupInvitation() {},
        admitDmMessage: () => ({ admitted: true as const, settled: Promise.resolve() }),
        listAssignments: () =>
          (['session-safe', 'session-danger'] as const).map((sessionId) => ({
            sessionId,
            purpose: 'Inspect files',
            activity: 'idle' as const,
            createdAt: '2026-09-19T00:00:00.000Z',
            updatedAt: '2026-09-19T00:00:00.000Z',
            permission: {
              grantId: 'grant',
              workspaceId: 'workspace',
              primaryCwd: '/projects/ada',
              mode:
                sessionId === 'session-danger'
                  ? ('danger-full-access' as const)
                  : ('workspace-write' as const),
              approval: sessionId === 'session-danger' ? ('never' as const) : ('ask' as const),
              presetRevision: sessionId === 'session-danger' ? 1 : 0,
            },
          })),
        getAssignment: () => undefined,
        whenIdle: async () => undefined,
        close: async () => undefined,
      }),
      ownership,
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = methods.sessions({ slug: 'ada' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toHaveLength(3);
    expect(result.value.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session-orchestrator', role: 'orchestrator' }),
        expect.objectContaining({
          sessionId: 'session-safe',
          assignmentAccessMode: 'workspace-write',
        }),
        expect.objectContaining({
          sessionId: 'session-danger',
          assignmentAccessMode: 'danger-full-access',
        }),
      ]),
    );
  });

  it('resolves only owned root Sessions to their PersonaBot for return navigation', () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-assignment': { botSlug: 'ada', rootRole: 'assignment' },
      'session-other': { botSlug: 'bob', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-child',
      botSlug: 'ada',
      rootRole: 'assignment',
      parentSessionId: 'session-assignment',
      provenance: 'subagent',
      at: '2026-09-19T00:00:01.000Z',
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
    });

    expect(methods.sessionOwner({ sessionId: 'session-orchestrator' })).toEqual({
      ok: true,
      value: {
        owner: {
          botSlug: 'ada',
          displayName: 'Ada',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          avatarSeed: 2,
          role: 'orchestrator',
        },
      },
    });
    expect(methods.sessionOwner({ sessionId: 'session-assignment' })).toEqual({
      ok: true,
      value: {
        owner: {
          botSlug: 'ada',
          displayName: 'Ada',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          avatarSeed: 2,
          role: 'assignment',
        },
      },
    });
    expect(methods.sessionOwner({ sessionId: 'session-child' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({ sessionId: 'session-other' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({ sessionId: 'unowned' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(methods.sessionOwner({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'sessionId is required' },
    });
  });

  it('lists the root Sessions of every current PersonaBot for the native Session list', () => {
    const ownership = createTestOwnership({
      'session-orchestrator': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-assignment': { botSlug: 'ada', rootRole: 'assignment' },
      'session-gone': { botSlug: 'bob', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-child',
      botSlug: 'ada',
      rootRole: 'assignment',
      parentSessionId: 'session-assignment',
      provenance: 'subagent',
      at: '2026-09-19T00:00:01.000Z',
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const result = methods.botSessionIds({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.sessionIds].sort()).toEqual([
      'session-assignment',
      'session-orchestrator',
    ]);
  });

  it('rejects malformed or unknown session reads', () => {
    const { methods } = setup();

    expect(methods.sessions({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.sessions({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });

  it('drives the developer-mode skill gate from the bridge', () => {
    const seen: boolean[] = [];
    const { methods } = setup([], ['ada'], undefined, createTestOwnership(), undefined, {
      set: (enabled: boolean) => {
        seen.push(enabled);
      },
    });

    expect(methods.developerModeSet({ enabled: true })).toEqual({
      ok: true,
      value: { accepted: true },
    });
    expect(methods.developerModeSet({ enabled: false })).toEqual({
      ok: true,
      value: { accepted: true },
    });
    expect(seen).toEqual([true, false]);
    expect(methods.developerModeSet({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'enabled is required' },
    });
    expect(methods.developerModeSet({ enabled: 'yes' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'enabled is required' },
    });
  });

  it('reports unaccepted developer-mode sets without a gate', () => {
    const { methods } = setup();

    expect(methods.developerModeSet({ enabled: true })).toEqual({
      ok: true,
      value: { accepted: false },
    });
  });

  it('buckets Profile activity by Host-local day with reasons and Memory commits', () => {
    const localDayOf = (at: string): string => {
      const date = new Date(at);
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };
    const atHour = (offsetDays: number, hour: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    const today = localDayOf(atHour(0, 10));
    const yesterday = localDayOf(atHour(-1, 10));
    const observed = [
      { at: atHour(-1, 9), reason: 'human-dm' },
      { at: atHour(0, 8), reason: 'group-mention' },
      { at: atHour(0, 12), reason: 'human-dm' },
    ];
    const memory = {
      activity: () => [{ at: atHour(-1, 9) }, { at: atHour(-1, 15) }, { at: atHour(0, 9) }],
    } as unknown as MemoryService;
    const usage = {
      activity: () => [
        {
          day: today,
          purpose: 'orchestrator',
          provider: 'deepseek',
          model: 'deepseek-chat',
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 10,
          cacheWriteTokens: 5,
        },
      ],
    } as unknown as UsageProjection;
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      undefined,
      undefined,
      memory,
      usage,
    );
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    channels.admissionActivity = (slug, sinceIso) =>
      slug === 'ada' ? observed.filter((entry) => entry.at >= sinceIso) : [];
    const group = channels.createGroup({ name: 'Team', members: [] });

    const result = methods.profileActivity({ channelId: dm.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('ada');
    expect(result.value.weeks).toBe(26);
    expect(result.value.today).toBe(today);
    expect(result.value.events).toEqual([
      { day: yesterday, reason: 'human-dm', count: 1 },
      { day: today, reason: 'group-mention', count: 1 },
      { day: today, reason: 'human-dm', count: 1 },
    ]);
    expect(result.value.memoryCommits).toEqual([
      { day: yesterday, count: 2 },
      { day: today, count: 1 },
    ]);
    expect(result.value.tokens).toEqual([
      {
        day: today,
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
    ]);
    expect(result.value.tokenTotals).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });

    expect(result.value.createdDay).toBe(localDayOf(registry.get('ada')!.createdAt));

    const older = methods.profileActivity({ channelId: dm.id, before: today, weeks: 4 });
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.value).toMatchObject({ before: today, weeks: 4 });
    expect(older.value.events).toEqual([{ day: yesterday, reason: 'human-dm', count: 1 }]);
    expect(older.value.memoryCommits).toEqual([{ day: yesterday, count: 2 }]);
    expect(older.value.tokens).toEqual([]);
    for (const window of [
      { before: '2026/10/01' },
      { before: 20261001 },
      { weeks: 0 },
      { weeks: 105 },
      { weeks: 1.5 },
    ])
      expect(methods.profileActivity({ channelId: dm.id, ...window }).ok).toBe(false);

    expect(methods.profileActivity({ channelId: group.id })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'Memory is available only in a PersonaBot DM',
      },
    });
    expect(methods.profileActivity({ channelId: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: missing' },
    });
  });

  it('saves an illustrated appearance through its DM, derives a bounded snapshot, and preserves it after rejected input', async () => {
    const { root, registry, channels, methods, states } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const recipe = {
      schemaVersion: 1,
      family: 'illustrated',
      assetVersion: 1,
      rigVersion: 1,
      head: 'round',
      pose: 'left',
      hair: 'sweep',
      eyes: 'sparkle',
      brows: 'raised',
      nose: 'dot',
      mouth: 'grin',
      cheeks: 'freckles',
      glasses: 'round',
      outfit: 'sailor',
      backdrop: 'hearts',
      accessory: 'headphones',
      skinColor: '#ebbd9f',
      hairColor: '#44332c',
      eyeColor: '#2f9e8f',
      shirtColor: '#6c8cbd',
    };
    const result = methods.botAppearanceSet({ channelId: dm.id, recipe });
    expect(result).toMatchObject({
      ok: true,
      value: {
        bot: { appearance: { recipe }, avatar: expect.stringContaining('/bot-avatar?slug=ada') },
      },
    });
    const saved = registry.get('ada')!;
    expect(saved.appearance?.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.avatar).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(saved.avatar!.split(',')[1]!, 'base64');
    expect(bytes.byteLength).toBeLessThanOrEqual(131_072);
    expect(bytes.readUInt32BE(16)).toBe(512);
    expect(bytes.readUInt32BE(20)).toBe(512);
    expect(createTestRegistry({ rootDir: root }).get('ada')).toEqual(saved);
    expect(methods.list({})).toMatchObject({
      ok: true,
      value: { bots: [{ appearance: { recipe, revision: saved.appearance?.revision } }] },
    });
    states.setApprovalCount('ada', 2);
    for (const invalid of [
      { ...recipe, head: 'unknown' },
      { ...recipe, accessory: 'glasses' },
      { ...recipe, hairColor: 'url(https://evil)' },
      { ...recipe, rigVersion: 9 },
      { ...recipe, script: 'payload' },
    ]) {
      expect(methods.botAppearanceSet({ channelId: dm.id, recipe: invalid })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(registry.get('ada')).toEqual(saved);
    }
    expect(
      methods.botAppearanceSet({
        channelId: channels.createGroup({ name: 'Group', members: ['ada'] }).id,
        recipe,
      }),
    ).toMatchObject({ ok: false });
    expect(states.snapshot('ada').attention).toEqual({ approvalCount: 2 });
    const { createBotAvatarHttp, BOT_AVATAR_PATH } = await import('../src/bots/avatar-http.js');
    const response = await createBotAvatarHttp(registry)(
      new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`),
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(methods.botAvatarSet({ channelId: dm.id, avatar: null }).ok).toBe(true);
    expect(registry.get('ada')?.appearance).toBeUndefined();
    expect(registry.get('ada')?.avatar).toBeUndefined();
  });

  it('saves a Bot Primary Color through the DM and keeps it across rename, Avatar edits and restart', () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
    const { root, registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const group = channels.createGroup({ name: 'Team', members: ['ada'] });
    const subject = () => registry.get('ada')!;
    const listed = () => {
      const result = methods.list({});
      if (!result.ok) throw new Error('list failed');
      return result.value.bots.find((bot) => bot.slug === 'ada')!;
    };

    expect(subject().primaryColor).toBeUndefined();
    expect(listed().primaryColor).toBeUndefined();
    expect(resolveBotPrimaryColor(subject())).toEqual({
      mode: 'automatic',
      source: 'hair',
      color: seededAvatarFor('Ada', subject().avatarSeed).hairColor,
    });

    const custom = { mode: 'custom', color: '#1D1B22' };
    expect(methods.botPrimaryColorSet({ channelId: dm.id, primaryColor: custom })).toMatchObject({
      ok: true,
      value: { bot: { primaryColor: { mode: 'custom', color: '#1d1b22' } } },
    });
    const saved = { mode: 'custom', color: '#1d1b22' };
    expect(subject().primaryColor).toEqual(saved);
    expect(listed().primaryColor).toEqual(saved);

    for (const invalid of [
      null,
      'custom',
      { mode: 'custom' },
      { mode: 'custom', color: 'red' },
      { mode: 'custom', color: 'url(https://evil)' },
      { mode: 'custom', color: '#1d1b22', fallback: '#ffffff' },
      { mode: 'automatic', color: '#1d1b22' },
      { mode: 'theme', color: '#1d1b22' },
    ]) {
      expect(methods.botPrimaryColorSet({ channelId: dm.id, primaryColor: invalid })).toMatchObject(
        { ok: false, error: { code: 'invalid-input' } },
      );
      expect(subject().primaryColor).toEqual(saved);
    }
    expect(
      methods.botPrimaryColorSet({ channelId: group.id, primaryColor: { mode: 'automatic' } }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      methods.botPrimaryColorSet({ channelId: 'missing', primaryColor: { mode: 'automatic' } }),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(subject().primaryColor).toEqual(saved);

    expect(registry.update('ada', { displayName: 'Ada Lovelace' }).ok).toBe(true);
    const recipe = { ...seededAvatarFor('Ada', undefined), hairColor: '#3fc1b8' };
    expect(methods.botAppearanceSet({ channelId: dm.id, recipe }).ok).toBe(true);
    expect(methods.botAvatarSet({ channelId: dm.id, avatar: image }).ok).toBe(true);
    expect(subject().primaryColor).toEqual(saved);
    expect(resolveBotPrimaryColor(subject())).toMatchObject({ source: 'custom', color: '#1d1b22' });

    const reopened = createTestRegistry({ rootDir: root });
    expect(reopened.get('ada')?.primaryColor).toEqual(saved);

    expect(
      methods.botPrimaryColorSet({ channelId: dm.id, primaryColor: { mode: 'automatic' } }),
    ).toMatchObject({ ok: true });
    expect(subject().primaryColor).toBeUndefined();
    expect(createTestRegistry({ rootDir: root }).get('ada')?.primaryColor).toBeUndefined();
    const fallback = resolveBotPrimaryColor(subject());
    expect(fallback).toEqual({
      mode: 'automatic',
      source: 'fallback',
      color: fallbackPrimaryColor('ada'),
    });
    expect(registry.update('ada', { displayName: 'Renamed' }).ok).toBe(true);
    expect(resolveBotPrimaryColor(subject())).toEqual(fallback);

    expect(methods.botAppearanceSet({ channelId: dm.id, recipe }).ok).toBe(true);
    expect(resolveBotPrimaryColor(subject())).toMatchObject({ source: 'hair', color: '#3fc1b8' });
  });

  it('sets a banner scene inside the DM and resets it to the name-seeded one', () => {
    const { registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const group = channels.createGroup({ name: 'Team', members: [] });
    const recipe = { scene: 'night-sky', seed: 12 };

    expect(methods.botBannerSet({ channelId: dm.id, banner: { recipe } })).toMatchObject({
      ok: true,
      value: { bot: { banner: { recipe } } },
    });
    expect(registry.get('ada')?.banner).toEqual({ recipe });
    expect(
      methods.botBannerSet({ channelId: dm.id, banner: { recipe: { scene: 'mars', seed: 1 } } }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.botBannerSet({ channelId: group.id, banner: null })).toMatchObject({
      ok: false,
    });

    expect(registry.update('ada', { displayName: 'Ada Lovelace' }).ok).toBe(true);
    expect(methods.botBannerSet({ channelId: dm.id, banner: null }).ok).toBe(true);
    expect(registry.get('ada')?.banner).toEqual({ recipe: seededBannerRecipe('Ada Lovelace') });
  });

  it('sets, maps, and clears one PersonaBot custom avatar inside its DM', () => {
    const avatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
    const { registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    const group = channels.createGroup({ name: 'Team', members: [] });
    const avatarUrl = expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u);

    const set = methods.botAvatarSet({ channelId: dm.id, avatar });
    expect(set).toMatchObject({ ok: true, value: { bot: { avatar: avatarUrl } } });
    expect(registry.get('ada')?.avatar).toBe(avatar);
    expect(methods.list({})).toMatchObject({ ok: true, value: { bots: [{ avatar: avatarUrl }] } });

    expect(
      methods.botAvatarSet({ channelId: dm.id, avatar: 'https://example.com/ada.png' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      methods.botAvatarSet({ channelId: dm.id, avatar: 'data:image/svg+xml;base64,AAAA' }),
    ).toMatchObject({ ok: false });
    expect(methods.botAvatarSet({ channelId: group.id, avatar: null })).toMatchObject({
      ok: false,
    });

    const cleared = methods.botAvatarSet({ channelId: dm.id, avatar: null });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.value.bot.avatar).toBeUndefined();
    expect(registry.get('ada')?.avatar).toBeUndefined();
  });
});

it('resolves attachment identity within its current message and keeps resend idempotency after an external save', async () => {
  const { attachments, channels, methods } = setup();
  const channel = channels.createGroup({ name: 'Files', members: [] });
  const ref = await attachments.upload({
    data: (async function* () {
      yield Buffer.from('source');
    })(),
    name: 'notes.txt',
  });
  const intent = {
    channelId: channel.id,
    messageId: 'human-00000000-0000-4000-8000-000000000000',
    body: '',
    attachments: [ref],
  };
  const result = await methods.channelSend(intent);
  expect(result.ok).toBe(true);
  const target = methods.messageAttachmentTarget({
    channelId: channel.id,
    messageId: 'human-00000000-0000-4000-8000-000000000000',
    fileId: ref.fileId,
  });
  expect(target.ok).toBe(true);
  if (!target.ok) throw new Error('Expected owner target');
  writeFileSync(target.value.target.path, 'saved with different size');
  const retry = await methods.channelSend(intent);
  expect(retry.ok).toBe(true);
  expect(channels.revision(channel.id)).toBe(1);
  expect(
    methods.messageAttachmentTarget({
      channelId: channel.id,
      messageId: 'wrong',
      fileId: ref.fileId,
    }).ok,
  ).toBe(false);
  expect(
    methods.messageAttachmentTarget({
      channelId: channel.id,
      messageId: 'human-00000000-0000-4000-8000-000000000000',
      fileId: ref.hash,
    }).ok,
  ).toBe(false);
});

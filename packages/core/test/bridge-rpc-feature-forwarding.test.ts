import { DEFAULT_CHANNEL_POLICY } from '../src/team/channel-contract.js';
import { registryDatabase } from './registry-fixture.js';
import { rmSync } from 'node:fs';
import { Context } from '@deepseek-ai/cordis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roots, setup, parameterNames } from './support/bridge-rpc.js';

afterEach(() => {
  for (const root of roots.splice(0)) {
    registryDatabase(root).close();
    rmSync(root, { recursive: true, force: true });
  }
});

describe('bridge typert service', () => {
  it('advertises and forwards the optional Routing Group engine read on the catalog RPC', async () => {
    const { service } = setup(undefined, {
      modelCatalog: { list: async () => [], validate: async () => undefined },
      routingGroupEngineOptions: async () => [
        { engine: 'codex', available: false, reason: 'not-installed' },
      ],
    });
    expect(parameterNames(service.modelCatalog)).toEqual(['includeRoutingGroupEngines']);
    await expect(service.modelCatalog()).resolves.toEqual({ models: [] });
    await expect(service.modelCatalog(true)).resolves.toEqual({
      models: [],
      routingGroupEngines: [{ engine: 'codex', available: false, reason: 'not-installed' }],
    });
  });

  it('refuses workspace authorization without an authenticated Human invocation', () => {
    const { service, methods } = setup();
    Object.defineProperty(service, 'ctx', { value: new Context() });
    const approve = vi.spyOn(methods, 'grantRequestApprove');
    expect(() => service.grantRequestApprove('ada', 'dm-ada', 'request', 'project', true)).toThrow(
      /Authenticated Human required/,
    );
    const guest = Object.create(service) as typeof service;
    Object.defineProperty(guest, 'ctx', {
      value: new Context().extend({ invocation: { peer: { principal: { kind: 'guest' } } } }),
    });
    expect(() => guest.grantRequestApprove('ada', 'dm-ada', 'request', 'project', true)).toThrow(
      /Authenticated Human required/,
    );
    expect(approve).not.toHaveBeenCalled();
  });

  it('declares and forwards explicit template deletion confirmation through the Gateway', () => {
    const { service, methods } = setup();
    const value = {
      template: { name: 'night-shift' },
      clearedBots: [],
      inheritedBots: [],
      globalDefault: null,
    };
    const deletion = vi
      .spyOn(methods, 'approvalTemplateDelete')
      .mockReturnValue({ ok: true, value });
    const revision = 'a'.repeat(64);
    expect(parameterNames(service.approvalTemplateDelete)).toEqual([
      'name',
      'confirmed',
      'revision',
    ]);
    expect(service.approvalTemplateDelete('night-shift', true, revision)).toEqual(value);
    expect(deletion).toHaveBeenLastCalledWith({ name: 'night-shift', confirmed: true, revision });
    deletion.mockReturnValueOnce({
      ok: false,
      error: { code: 'confirmation-required', message: 'confirmation-required' },
    });
    expect(() => service.approvalTemplateDelete('night-shift', false, revision)).toThrow(
      expect.objectContaining({ code: 'confirmation-required' }),
    );
    expect(deletion).toHaveBeenLastCalledWith({ name: 'night-shift', confirmed: false, revision });
  });

  it('forwards optional policy revisions and preserves stale-policy refusals', async () => {
    const { service, methods } = setup();
    const set = vi.spyOn(methods, 'channelPolicySet').mockResolvedValue({ ok: true, value: null });
    expect(parameterNames(service.channelPolicySet)).toEqual([
      'channelId',
      'policy',
      'expectedRevision',
    ]);
    await expect(
      service.channelPolicySet('group-1', DEFAULT_CHANNEL_POLICY, 'a'.repeat(64)),
    ).resolves.toBeNull();
    expect(set).toHaveBeenLastCalledWith({
      channelId: 'group-1',
      policy: DEFAULT_CHANNEL_POLICY,
      expectedRevision: 'a'.repeat(64),
    });
    await service.channelPolicySet('group-1', DEFAULT_CHANNEL_POLICY);
    expect(set).toHaveBeenLastCalledWith({ channelId: 'group-1', policy: DEFAULT_CHANNEL_POLICY });
    set.mockResolvedValueOnce({
      ok: false,
      error: { code: 'stale-channel-policy', message: 'stale-channel-policy' },
    });
    await expect(
      service.channelPolicySet('group-1', DEFAULT_CHANNEL_POLICY, 'a'.repeat(64)),
    ).rejects.toMatchObject({ code: 'stale-channel-policy' });
  });

  it('refuses reviewed or keyed Channel writes when the durable owner is unavailable', () => {
    const { service, channels } = setup();
    service.create('Ada');
    const group = service.channelCreate('Legacy', []).channel;
    const before = channels.list();
    expect(() => service.channelCreate('Keyed', [], 'keyed-create-1')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada', 'keyed-invite-1')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada', undefined, 'observed')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGet(group.id)).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(channels.list()).toEqual(before);
  });

  it('refuses admitting protected Tob through legacy group creation, invitation or join acceptance', () => {
    const { service, channels } = setup(
      undefined,
      {
        tob: {
          async close() {},
          ensure: async () => {
            throw new Error('unused');
          },
          isTob: (slug) => slug === 'ada',
          slug: () => 'ada',
          readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
          writeSetting: async () => {
            throw new Error('unused');
          },
        },
      },
      true,
    );
    const bot = service.create('Ada').bot;
    const group = service.channelCreate('Group', []).channel;
    expect(() => service.channelCreate('Protected', ['ada'])).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada')).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    const request = channels.requestGroupJoin({
      channelId: group.id,
      requesterBotSlug: 'ada',
      requesterBotCreatedAt: bot.createdAt,
    });
    expect(() => service.channelGroupJoinDecide(group.id, request.id, true)).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(channels.get(group.id)?.members).toEqual([]);
    expect(
      channels.get(group.id)?.joinRequests?.find((entry) => entry.id === request.id)?.status,
    ).toBe('pending');
    service.channelGroupJoinDecide(group.id, request.id, false);
    expect(
      channels.get(group.id)?.joinRequests?.find((entry) => entry.id === request.id)?.status,
    ).toBe('declined');
  });

  it('forwards optional reviewed fingerprints for Group name, avatar, wake and member edits', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const response = { ok: true as const, value: { channel } };
    const rename = vi.spyOn(methods, 'channelRename').mockReturnValue(response);
    const avatar = vi.spyOn(methods, 'channelGroupAvatarSet').mockReturnValue(response);
    const wake = vi.spyOn(methods, 'channelGroupWakeSet').mockReturnValue(response);
    const remove = vi.spyOn(methods, 'channelGroupMemberRemove').mockReturnValue(response);
    service.channelRename(channel.id, 'New name', 'reviewed');
    expect(rename).toHaveBeenCalledWith({
      channelId: channel.id,
      name: 'New name',
      expectedChannel: 'reviewed',
    });
    service.channelGroupAvatarSet(channel.id, null, 'reviewed');
    expect(avatar).toHaveBeenCalledWith({
      channelId: channel.id,
      avatar: null,
      expectedChannel: 'reviewed',
    });
    service.channelGroupWakeSet(channel.id, 'ada', 'silent', 5, 30, true, 'reviewed');
    expect(wake).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
      inherit: true,
      expectedChannel: 'reviewed',
    });
    service.channelGroupMemberRemove(channel.id, 'ada', 'reviewed');
    expect(remove).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      expectedChannel: 'reviewed',
    });
  });

  it('forwards optional fingerprints for invitation cancellation and join decisions', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const cancel = vi
      .spyOn(methods, 'channelGroupInviteCancel')
      .mockReturnValue({ ok: true, value: { channel } });
    const decide = vi
      .spyOn(methods, 'channelGroupJoinDecide')
      .mockReturnValue({ ok: true, value: { channel } });
    service.channelGroupInviteCancel(channel.id, 'invitation', 'observed');
    expect(cancel).toHaveBeenCalledWith({
      channelId: channel.id,
      invitationId: 'invitation',
      expectedChannel: 'observed',
    });
    service.channelGroupJoinDecide(channel.id, 'request', false, 'observed');
    expect(decide).toHaveBeenCalledWith({
      channelId: channel.id,
      requestId: 'request',
      accept: false,
      expectedChannel: 'observed',
    });
    service.channelGroupJoinDecide(channel.id, 'request', true);
    expect(decide).toHaveBeenLastCalledWith({
      channelId: channel.id,
      requestId: 'request',
      accept: true,
    });
    service.channelGroupInviteCancel(channel.id, 'invitation');
    expect(cancel).toHaveBeenLastCalledWith({ channelId: channel.id, invitationId: 'invitation' });
  });

  it('forwards Channel fingerprints and stable operation keys through the named RPC facade', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const snapshot = {
      channel,
      channelFingerprint: 'observed',
      invitationPolicy: { autoAccept: false },
      wakePolicies: [],
    };
    const get = vi.spyOn(methods, 'channelGet').mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelGet(channel.id)).toEqual(snapshot);
    expect(get).toHaveBeenCalledWith({ channelId: channel.id });
    const create = vi
      .spyOn(methods, 'channelCreate')
      .mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelCreate('Team', [], 'create-team-1')).toEqual(snapshot);
    expect(create).toHaveBeenCalledWith({
      name: 'Team',
      members: [],
      operationKey: 'create-team-1',
    });
    const invite = vi
      .spyOn(methods, 'channelGroupInvite')
      .mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelGroupInvite(channel.id, 'ada', 'invite-team-1', 'observed')).toEqual(
      snapshot,
    );
    expect(invite).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      operationKey: 'invite-team-1',
      expectedChannel: 'observed',
    });
    invite.mockReturnValue({
      ok: false,
      error: { code: 'stale-channel', message: 'Channel changed' },
    });
    expect(() => service.channelGroupInvite(channel.id, 'ada', 'invite-team-1', 'old')).toThrow(
      expect.objectContaining({ code: 'stale-channel' }),
    );
  });

  it('forwards Bot creation identity and Core Memory through the named RPC facade', () => {
    const { service, methods } = setup();
    const bot = service.create('Ada').bot;
    const receipt = {
      operationKey: 'create-ada-1',
      botSlug: bot.slug,
      status: 'created' as const,
      channelId: 'dm-ada',
    };
    const create = vi
      .spyOn(methods, 'create')
      .mockReturnValue({ ok: true, value: { bot, receipt, channelId: 'dm-ada' } });
    const result = service.create(
      'Ada',
      ['research'],
      'Soul',
      'Bio',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Remember this',
      'create-ada-1',
    );
    expect(create).toHaveBeenCalledWith({
      displayName: 'Ada',
      roles: ['research'],
      persona: 'Soul',
      description: 'Bio',
      model: undefined,
      preset: undefined,
      workspaces: undefined,
      avatar: undefined,
      memoryLocation: undefined,
      coreMemory: 'Remember this',
      operationKey: 'create-ada-1',
    });
    expect(result.receipt).toEqual(receipt);
    expect(result.channelId).toBe('dm-ada');
  });

  it('forwards every lookup field and preserves receipt refusals through the RPC facade', () => {
    const { service, methods } = setup();
    const lookup = vi
      .spyOn(methods, 'createLookup')
      .mockReturnValue({ ok: true, value: { receipt: null } });
    expect(
      service.createLookup(
        'lookup-ada-01',
        'Ada',
        ['research'],
        'Soul',
        'Bio',
        'model',
        'preset',
        ['workspace'],
        'avatar',
        'memory',
        'Remember',
      ),
    ).toEqual({ receipt: null });
    expect(lookup).toHaveBeenCalledWith({
      operationKey: 'lookup-ada-01',
      displayName: 'Ada',
      roles: ['research'],
      persona: 'Soul',
      description: 'Bio',
      model: 'model',
      preset: 'preset',
      workspaces: ['workspace'],
      avatar: 'avatar',
      memoryLocation: 'memory',
      coreMemory: 'Remember',
    });
    lookup.mockReturnValue({
      ok: false,
      error: { code: 'creation-key-conflict', message: 'Different input' },
    });
    expect(() => service.createLookup('lookup-ada-01', 'Changed')).toThrow('Different input');
  });

  it('forwards the Marketplace origin of a Git install through the named RPC facade', async () => {
    const { service, methods } = setup();
    const createFromGit = vi
      .spyOn(methods, 'createFromGit')
      .mockResolvedValue({ ok: false, error: { code: 'git-clone-failed', message: 'offline' } });
    await expect(
      service.createFromGit(
        'Mascot',
        'https://github.com/alice/mascot.git',
        ['helper'],
        'Bio',
        'marketplace',
      ),
    ).rejects.toThrow();
    expect(createFromGit).toHaveBeenCalledWith({
      displayName: 'Mascot',
      gitUrl: 'https://github.com/alice/mascot.git',
      roles: ['helper'],
      description: 'Bio',
      origin: 'marketplace',
      operationKey: undefined,
      expectedCommit: undefined,
    });
  });

  it('forwards the Marketplace install source through the named RPC facade (#3342)', async () => {
    const { service, methods } = setup();
    const install = vi
      .spyOn(methods, 'marketplaceInstall')
      .mockResolvedValue({ ok: false, error: { code: 'not-found', message: 'gone' } });
    await expect(
      service.marketplaceInstall('R_doubao', 'review-1', undefined, 'digest'),
    ).rejects.toThrow('gone');
    expect(install).toHaveBeenCalledWith({
      id: 'R_doubao',
      reviewId: 'review-1',
      operationKey: undefined,
      source: 'digest',
    });
  });

  it('round-trips profile fingerprint and preserves stale profile refusal through the RPC facade', () => {
    const { service } = setup();
    service.create('Ada');
    const initial = service.get('ada');
    if (!('profileFingerprint' in initial)) throw new Error('own-profile-redacted');
    const fingerprint = initial.profileFingerprint;
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    service.update('ada', { displayName: 'Updated' }, fingerprint);
    expect(() => service.update('ada', { displayName: 'Stale' }, fingerprint)).toThrow(
      expect.objectContaining({ code: 'stale-profile' }),
    );
    expect(service.get('ada').bot.displayName).toBe('Updated');
    const updated = service.get('ada');
    if (!('profileFingerprint' in updated)) throw new Error('own-profile-redacted');
    expect(updated.profileFingerprint).not.toBe(fingerprint);
    const edited = service.update('ada', { description: 'Existing UI' });
    if ('metadataOnly' in edited) throw new Error('own-profile-redacted');
    expect(edited.bot.description).toBe('Existing UI');
  });

  it('exposes and forwards complete Assignment choices through preset creation and updates', async () => {
    const { service, methods } = setup();
    const route = { provider: 'test', model: 'model' };
    const assignmentModels = [
      { ...route, allowedEfforts: ['', 'high'], defaultEffort: '', note: 'Preserve this note' },
    ];
    const preset = {
      id: 'p',
      name: 'Daily',
      revision: 1,
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
      createdAt: '2026-10-18T00:00:00Z',
    };
    const create = vi
      .spyOn(methods, 'modelPresetCreate')
      .mockResolvedValue({ ok: true, value: { preset } });
    const update = vi
      .spyOn(methods, 'modelPresetUpdate')
      .mockResolvedValue({ ok: true, value: { preset } });
    expect(parameterNames(service.modelPresetCreate)).toEqual([
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
      'openAssignmentModels',
      'orchestratorGroupId',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'orchestratorGroupEffort',
      'orchestratorEngine',
      'assignmentEngine',
      'sub',
    ]);
    expect(parameterNames(service.modelPresetUpdate)).toEqual([
      'id',
      'expectedRevision',
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
      'openAssignmentModels',
      'orchestratorGroupId',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'orchestratorGroupEffort',
      'orchestratorEngine',
      'assignmentEngine',
      'assignmentFollowsMain',
      'sub',
    ]);
    expect(parameterNames(service.modelPlanSet)).toEqual([
      'slug',
      'expectedRevision',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
      'openAssignmentModels',
      'orchestratorGroupId',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'orchestratorGroupEffort',
      'sub',
    ]);
    expect(parameterNames(service.modelPlanSub)).toEqual(['slug']);
    expect(parameterNames(service.modelPlanSubSet)).toEqual(['slug', 'expectedRevision', 'sub']);
    const planSet = vi
      .spyOn(methods, 'modelPlanSet')
      .mockResolvedValue({ ok: true, value: { plan: {} as never } });
    await service.modelPlanSet(
      'ada',
      3,
      undefined,
      route,
      assignmentModels,
      undefined,
      'g',
      ['h'],
      'h',
      null,
    );
    expect(planSet).toHaveBeenCalledWith({
      slug: 'ada',
      expectedRevision: 3,
      assignmentDefault: route,
      assignmentModels,
      orchestratorGroupId: 'g',
      assignmentGroups: ['h'],
      assignmentDefaultGroupId: 'h',
      assignmentGroupOptions: null,
    });
    await service.modelPresetCreate('Daily', route, route, assignmentModels);
    expect(create).toHaveBeenCalledWith({
      name: 'Daily',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
    const orchestratorEngine = { engine: 'codex' as const, model: 'gpt-6', effort: 'high' };
    const assignmentEngine = { engine: 'claude' as const, model: 'opus' };
    await service.modelPresetCreate(
      'Daily',
      route,
      route,
      assignmentModels,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      orchestratorEngine,
      assignmentEngine,
    );
    expect(create).toHaveBeenLastCalledWith({
      name: 'Daily',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
      orchestratorEngine,
      assignmentEngine,
    });
    await service.modelPresetUpdate(
      'default',
      1,
      'Daily',
      route,
      route,
      assignmentModels,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      orchestratorEngine,
      null,
      false,
    );
    expect(update).toHaveBeenCalledWith({
      id: 'default',
      expectedRevision: 1,
      name: 'Daily',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
      orchestratorEngine,
      assignmentEngine: null,
      assignmentFollowsMain: false,
    });
  });

  it('exposes Activity and notification query arguments and refuses an unavailable owner', () => {
    const { service, methods } = setup();
    const query = vi.spyOn(methods, 'humanAttention');
    expect(parameterNames(service.humanAttention)).toEqual([
      'category',
      'botSlug',
      'channelId',
      'limit',
      'cursor',
      'sort',
      'snoozed',
      'kind',
      'search',
      'unreadOnly',
      'queryVersion',
      'dismissed',
      'notifications',
    ]);
    expect(parameterNames(service.humanAttentionRestore)).toEqual(['itemId', 'sourceKey']);
    expect(() =>
      service.humanAttention(
        'replies',
        undefined,
        undefined,
        30,
        undefined,
        'mentions-first',
        undefined,
        undefined,
        'budget',
        true,
        1,
      ),
    ).toThrow('Activity queries are unavailable');
    expect(() =>
      service.humanAttention(
        undefined,
        undefined,
        undefined,
        100,
        'notification-cursor',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    ).toThrow('notification queries are unavailable');
    expect(query).toHaveBeenLastCalledWith({
      category: undefined,
      botSlug: undefined,
      channelId: undefined,
      limit: 100,
      cursor: 'notification-cursor',
      sort: undefined,
      snoozed: undefined,
      kind: undefined,
      search: undefined,
      unreadOnly: undefined,
      queryVersion: undefined,
      dismissed: undefined,
      notifications: true,
    });
  });

  it('exposes and forwards model revision and advanced preset arguments through the gateway façade', async () => {
    const { service, methods } = setup();
    expect(parameterNames(service.onboardingModel)).toEqual([
      'slug',
      'expectedRevision',
      'route',
      'globalDefault',
      'expectedDefaultRevision',
      'groupId',
      'groupEffort',
      'expectedDefaultGroupRevision',
    ]);
    expect(parameterNames(service.modelPresetApply)).toEqual([
      'slug',
      'presetId',
      'expectedRevision',
      'expectedPresetRevision',
    ]);
    expect(parameterNames(service.modelPresetCreate)).toEqual([
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
      'openAssignmentModels',
      'orchestratorGroupId',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'orchestratorGroupEffort',
      'orchestratorEngine',
      'assignmentEngine',
      'sub',
    ]);
    expect(parameterNames(service.modelPresetUpdate)).toEqual([
      'id',
      'expectedRevision',
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
      'openAssignmentModels',
      'orchestratorGroupId',
      'assignmentGroups',
      'assignmentDefaultGroupId',
      'assignmentGroupOptions',
      'orchestratorGroupEffort',
      'orchestratorEngine',
      'assignmentEngine',
      'assignmentFollowsMain',
      'sub',
    ]);
    const route = { provider: 'official', model: 'fast', reasoningEffort: 'high' };
    const assignmentModels = [
      { provider: 'official', model: 'fast', allowedEfforts: ['high'], defaultEffort: 'high' },
    ];
    const refusal = { ok: false as const, error: { code: 'stale-setting', message: 'stale test' } };
    const defaultCall = vi.spyOn(methods, 'onboardingModel').mockResolvedValue(refusal);
    const applyCall = vi.spyOn(methods, 'modelPresetApply').mockResolvedValue(refusal);
    const createCall = vi.spyOn(methods, 'modelPresetCreate').mockResolvedValue(refusal);
    const updateCall = vi.spyOn(methods, 'modelPresetUpdate').mockResolvedValue(refusal);
    await expect(service.onboardingModel(undefined, 0, route, true, 7)).rejects.toThrow(
      'stale test',
    );
    expect(defaultCall).toHaveBeenCalledWith({
      slug: undefined,
      expectedRevision: 0,
      route,
      globalDefault: true,
      expectedDefaultRevision: 7,
    });
    await expect(
      service.onboardingModel(undefined, 0, undefined, true, 7, 'daily', 'high', 2),
    ).rejects.toThrow('stale test');
    expect(defaultCall).toHaveBeenLastCalledWith({
      slug: undefined,
      expectedRevision: 0,
      globalDefault: true,
      expectedDefaultRevision: 7,
      groupId: 'daily',
      groupEffort: 'high',
      expectedDefaultGroupRevision: 2,
    });
    await expect(service.modelPresetApply('one', 'preset', 2, 3)).rejects.toThrow('stale test');
    expect(applyCall).toHaveBeenCalledWith({
      slug: 'one',
      presetId: 'preset',
      expectedRevision: 2,
      expectedPresetRevision: 3,
    });
    await expect(service.modelPresetCreate('New', route, route, assignmentModels)).rejects.toThrow(
      'stale test',
    );
    expect(createCall).toHaveBeenCalledWith({
      name: 'New',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
    await expect(
      service.modelPresetUpdate('preset', 3, 'New', route, route, assignmentModels),
    ).rejects.toThrow('stale test');
    expect(updateCall).toHaveBeenCalledWith({
      id: 'preset',
      expectedRevision: 3,
      name: 'New',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
  });
});

it('exports the named Overview period and cursor through the existing Typert service', async () => {
  const { service } = setup();
  expect(parameterNames(service.overviewMemory)).toEqual(['after']);
  await expect(service.overviewMemory()).rejects.toThrow('Memory statistics unavailable');
  expect(parameterNames(service.overviewUsage)).toEqual(['period', 'after']);
  expect(() => service.overviewUsage('week')).toThrow('Usage statistics unavailable');
});

it('exposes named Tob CLI start/status/cancel arguments through the gateway facade', async () => {
  const { service, methods } = setup();
  const response = {
    id: 'lease',
    channelId: 'dm-tob',
    messageId: 'human-cli',
    state: 'running' as const,
    cancelRequested: false,
  };
  const owner = vi.spyOn(methods, 'tobCli').mockResolvedValue({ ok: true, value: response });
  expect(parameterNames(service.tobCli)).toEqual(['action', 'command', 'id']);
  expect(await service.tobCli('start', { argv: ['approval-templates'], stdin: '' })).toEqual(
    response,
  );
  expect(owner).toHaveBeenLastCalledWith({
    action: 'start',
    command: { argv: ['approval-templates'], stdin: '' },
  });
  await service.tobCli('status', undefined, 'lease');
  expect(owner).toHaveBeenLastCalledWith({ action: 'status', id: 'lease' });
  await service.tobCli('cancel', undefined, 'lease');
  expect(owner).toHaveBeenLastCalledWith({ action: 'cancel', id: 'lease' });
});

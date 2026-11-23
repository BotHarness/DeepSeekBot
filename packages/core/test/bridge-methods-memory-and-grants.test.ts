import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRosterStore } from './roster-fixture.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
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
      setOrchestratorWrite: (_slug, _id, enabled) => ({
        ...grant,
        orchestratorWrite: enabled,
      }),
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
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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
      grantRequestResolution: {
        requestMessageId: 'grant-request-1',
        grantId: 'grant-1',
      },
    };
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: {
          ...payload.grantRequestResolution,
          grantId: 'unknown',
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: {
          ...payload.grantRequestResolution,
          requestMessageId: 'missing',
        },
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

  it('persists a Human Memory branch choice and rejects a conflicting retry', async () => {
    const { channels, methods } = setup();
    channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'Switch Memory to history',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
      memorySwitchTarget: 'history',
    };
    const first = await methods.channelSend(payload);
    expect(first).toMatchObject({
      ok: true,
      value: {
        message: { author: { kind: 'human' }, memorySwitchTarget: 'history' },
      },
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
});

it('logs why storage cleanup failed instead of hiding it behind storage-unavailable (#2882)', () => {
  const h = setup();
  const warn = vi.fn();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: h.registry,
    states: h.states,
    channels: h.channels,
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
    warn,
    storage: {
      usage: () => {
        throw new Error('usage broke');
      },
      preview: () => {
        throw new Error('Managed files contain a link');
      },
      confirm: () => {
        throw new Error('unused');
      },
    },
  });
  expect(methods.storageCleanupPreview({ before: '2026-01-01T00:00:00.000Z' })).toEqual({
    ok: false,
    error: {
      code: 'storage-unavailable',
      message: 'Storage cleanup preview is unavailable',
    },
  });
  expect(warn).toHaveBeenCalledWith(
    'Storage cleanup preview is unavailable: Managed files contain a link',
  );
});

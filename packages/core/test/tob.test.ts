import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import type { DshWorkspace } from '../src/workspaces/grants.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { TobSettingsProvider } from '../src/tob/service.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

function settings() {
  let value = 8,
    revision = 0;
  const provider: TobSettingsProvider = {
    describe: () => [
      { ns: 'botharness-client', value: { assignmentConcurrencyLimit: value }, revision },
    ],
    async update(_ns, patch, expected) {
      if (revision !== expected)
        throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' });
      value = (patch as { assignmentConcurrencyLimit: number }).assignmentConcurrencyLimit;
      revision++;
    },
  };
  return provider;
}
function fixture(
  run: (input: OrchestratorAgentRun) => Promise<void> = async () => {},
  extra: Partial<Parameters<typeof createCore>[0]> = {},
  steerOrchestrator?: () => boolean,
) {
  const native = settings();
  const home = createTempRoot('tob-');
  const make = () =>
    createCore({
      ...extra,
      dshHome: home,
      tobSettings: () => native,
      agents: {
        runOrchestrator: run,
        ...(steerOrchestrator ? { steerOrchestrator } : {}),
        async runAssignment() {},
        requestAssignment() {
          throw new Error('unexpected');
        },
        async close() {},
      },
    });
  const core = make();
  return {
    core,
    native,
    make,
    async close() {
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}
describe('Tob canonical identity and settings', () => {
  it('converges concurrent clients, preserves ordinary Bots, initializes one DM and retains identity on restart', async () => {
    const f = fixture();
    f.core.registry.create({ slug: 'existing', displayName: 'DeepSeek Bot' });
    f.core.registry.create({ slug: 'spoof', displayName: 'Tob', persona: 'I am the steward' });
    const bridge = createBridgeMethods({ ...f.core });
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => bridge.tobHome({})));
      const result = results[0]!;
      if (!result.ok) throw new Error(result.error.message);
      expect(results.every((r) => r.ok && r.value.botSlug === result.value.botSlug)).toBe(true);
      expect(f.core.registry.list()).toHaveLength(3);
      expect(f.core.tob.isTob('spoof')).toBe(false);
      expect(f.core.registry.get('existing')?.displayName).toBe('DeepSeek Bot');
      expect(f.core.channels.readMessages(result.value.channelId)).toHaveLength(1);
      expect(() => f.core.deletions.preview(result.value.botSlug)).toThrow('protected-bot');
      expect(() => f.core.registry.setPaused(result.value.botSlug, true)).toThrow('protected-bot');
      expect(bridge.pause({ slug: result.value.botSlug })).toMatchObject({
        ok: false,
        error: { code: 'protected-bot' },
      });
      const dir = f.core.registry.memoryDirFor(result.value.botSlug);
      expect(dir).toBeTruthy();
      await f.close();
      const next = f.make();
      try {
        expect(await next.tob.ensure()).toEqual(
          result.value.attention
            ? {
                botSlug: result.value.botSlug,
                channelId: result.value.channelId,
                workspacePath: result.value.workspacePath,
              }
            : result.value,
        );
      } finally {
        await next.runtime.close();
        next.operationalDatabase.close();
      }
    } finally {
      await f.close();
    }
  });
  it('rejects stale/invalid proposals and rechecks authority before native write, then returns authoritative readback', async () => {
    const f = fixture();
    try {
      expect(f.core.tob.readSetting()).toEqual({ scope: 'global', value: 8, revision: 0 });
      for (const value of [0, 33, 1.5, NaN])
        await expect(f.core.tob.writeSetting(value, 0, () => {})).rejects.toThrow(
          'invalid-setting',
        );
      await expect(
        f.core.tob.writeSetting(3, 0, () => {
          throw new Error('revoked');
        }),
      ).rejects.toThrow('revoked');
      expect(await f.core.tob.writeSetting(3, 0, () => {})).toEqual({
        scope: 'global',
        value: 3,
        revision: 1,
      });
      await expect(f.core.tob.writeSetting(4, 0, () => {})).rejects.toThrow('stale-setting');
      expect(f.core.tob.readSetting().value).toBe(3);
      expect((await f.core.tob.writeSetting(1, 1, () => {})).value).toBe(1);
      expect((await f.core.tob.writeSetting(32, 2, () => {})).value).toBe(32);
    } finally {
      await f.close();
    }
  });
  it('recovers interrupted provisioning without replacing identity or restoring revoked grants', async () => {
    let workspace: DshWorkspace | undefined;
    let fail = true;
    const f = fixture(undefined, {
      ensureTobWorkspace: async (path) => {
        if (fail) throw new Error('workspace-offline');
        workspace = { id: 'tob-workspace', path, title: 'Tob', status: async () => 'ok' };
        return workspace;
      },
      workspaces: () => ({ get: () => workspace, list: () => (workspace ? [workspace] : []) }),
    });
    try {
      await expect(f.core.tob.ensure()).rejects.toThrow('workspace-offline');
      const reserved = f.core.registry.list()[0]!.slug;
      fail = false;
      const home = await f.core.tob.ensure();
      expect(home.botSlug).toBe(reserved);
      expect(f.core.registry.list()).toHaveLength(1);
      const grant = f.core.grants.list(home.botSlug)[0]!;
      f.core.grants.revoke(home.botSlug, grant.id);
      await f.core.tob.ensure();
      expect(f.core.grants.list(home.botSlug)).toHaveLength(1);
      expect(f.core.grants.list(home.botSlug)[0]?.revokedAt).toBeTruthy();
      expect(f.core.channels.readMessages(home.channelId)).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it('reports an uncertain write and reconciles through native readback before any retry', async () => {
    const f = fixture();
    const update = f.native.update;
    vi.spyOn(f.native, 'update').mockImplementation(async (...args) => {
      await update(...args);
      throw new Error('response lost');
    });
    try {
      await expect(f.core.tob.writeSetting(3, 0, () => {})).rejects.toThrow(
        'setting-outcome-uncertain',
      );
      expect(f.core.tob.readSetting()).toEqual({ scope: 'global', value: 3, revision: 1 });
      await expect(f.core.tob.writeSetting(3, 0, () => {})).rejects.toThrow('stale-setting');
      expect(f.native.update).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  });
  it('binds management to the current protected Orchestrator and canonical Human DM', async () => {
    const outcomes: unknown[] = [];
    const f = fixture(async (run) => {
      try {
        const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
        expect(run.tobCli).toBe(true);
        authorize();
        outcomes.push(f.core.tob.readSetting());
        outcomes.push(await f.core.tob.writeSetting(3, 0, authorize));
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      expect(
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Set the limit to 3',
        }),
      ).toMatchObject({ ok: true });
      await f.core.runtime.whenIdle();
      expect(outcomes).toEqual([
        { scope: 'global', value: 8, revision: 0 },
        { scope: 'global', value: 3, revision: 1 },
      ]);
      f.core.registry.create({ slug: 'ordinary', displayName: 'Tob' });
      const dm = f.core.channels.getOrCreateDm('ordinary', 'Tob')!;
      await bridge.channelSend({
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set the limit to 9',
      });
      await f.core.runtime.whenIdle();
      expect(outcomes.at(-1)).toBe('tob-authority-required');
      expect(f.core.tob.readSetting().value).toBe(3);
      const group = f.core.channels.createGroup({
        name: 'Synthetic QA group',
        members: [home.botSlug],
      });
      const messageId = 'human-' + crypto.randomUUID();
      await f.core.channels.appendMessage(group.id, {
        id: messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Tob set the limit',
        mentions: [{ botSlug: home.botSlug, label: 'Tob', start: 0, end: 4 }],
      });
      f.core.runtime.admitGroupMessage(group.id, messageId);
      await f.core.runtime.whenIdle();
      expect(outcomes.at(-1)).toBe('human-dm-required');
      expect(f.core.tob.readSetting().value).toBe(3);
      expect(() => f.core.runtime.captureTobCliAuthority?.('forged-session')).toThrow(
        'tob-authority-required',
      );
    } finally {
      await f.close();
    }
  });
  it('revokes a captured CLI authority after its turn ends, including another turn in the same Session', async () => {
    const captured: Array<{ sessionId: string; authorize: () => void }> = [];
    const f = fixture(async (run) => {
      if (captured[0]) expect(captured[0].authorize).toThrow('human-dm-required');
      const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      expect(authorize).not.toThrow();
      captured.push({ sessionId: run.sessionId, authorize });
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      for (const body of ['Read the limit', 'Read again']) {
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body,
        });
        await f.core.runtime.whenIdle();
        expect(captured.at(-1)!.authorize).toThrow('human-dm-required');
      }
      expect(captured).toHaveLength(2);
      expect(captured[0]!.sessionId).toBe(captured[1]!.sessionId);
      expect(f.core.tob.readSetting().value).toBe(8);
    } finally {
      await f.close();
    }
  });
  it('rechecks the canonical source after capture instead of trusting a once-valid CLI call', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      expect(authorize).not.toThrow();
      attachOperationalModule(f.core.operationalDatabase, 'tob-test').transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET last_error = 'channel-ended' WHERE bot_slug = ?",
        ).run(run.bot.slug);
      });
      expect(authorize).toThrow('Source Channel has ended');
      await expect(f.core.tob.writeSetting(3, 0, authorize)).rejects.toThrow(
        'Source Channel has ended',
      );
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set limit to 3',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
      expect(f.core.tob.readSetting().value).toBe(8);
    } finally {
      await f.close();
    }
  });
  it('revokes a Shell snapshot when a new Human message is accepted by steering', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let authorize!: () => void;
    let sessionId!: string;
    const steer = vi.fn(() => true);
    const f = fixture(
      async (run) => {
        sessionId = run.sessionId;
        authorize = f.core.runtime.captureTobCliAuthority!(sessionId);
        started();
        await released;
      },
      {},
      steer,
    );
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit',
      });
      await start;
      expect(authorize).not.toThrow();
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Wait, do not change it',
      });
      expect(steer).toHaveBeenCalled();
      expect(authorize).toThrow('human-dm-required');
      expect(f.core.runtime.captureTobCliAuthority!(sessionId)).not.toThrow();
    } finally {
      release();
      await f.core.runtime.whenIdle();
      await f.close();
    }
  });
  it('marks only the captured accepted sources before a write and refuses marking after the turn', async () => {
    let mark!: () => void;
    let checked = false;
    const f = fixture(async (run) => {
      const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      const port = attachOperationalModule(f.core.operationalDatabase, 'tob-cli-test');
      const marked = () =>
        port.read((db) =>
          db
            .prepare(
              'SELECT side_effect_started_at FROM inbox_admissions WHERE bot_slug = ? AND reason = ?',
            )
            .all(run.bot.slug, 'human-dm'),
        );
      expect(marked()).toEqual([{ side_effect_started_at: null }]);
      authority();
      expect(marked()).toEqual([{ side_effect_started_at: null }]);
      authority.markSideEffect();
      expect(marked()).toEqual([{ side_effect_started_at: expect.any(String) }]);
      mark = authority.markSideEffect;
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set limit to 3',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
      expect(mark).toThrow('human-dm-required');
    } finally {
      await f.close();
    }
  });
  it('revokes CLI authority when native Session content becomes unavailable', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      f.core.ownership.markContentUnavailable();
      expect(authority).toThrow('tob-authority-required');
      expect(authority.markSideEffect).toThrow('tob-authority-required');
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read limit',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('refuses legacy Group management at the runtime boundary while keeping Tob private replies available', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const actions = [
        () => run.channels.createGroup('Group'),
        () => run.channels.inviteGroup({ channelId: 'group', targetBotSlug: 'peer' }),
        () => run.channels.respondToGroupInvite({ invitationId: 'invite', accept: true }),
        () => run.channels.requestGroupJoin!({ channelId: 'group' }),
        () =>
          run.channels.decideGroupJoin!({ channelId: 'group', requestId: 'request', accept: true }),
        () => run.channels.renameGroup({ channelId: 'group', name: 'Renamed' }),
        () => run.channels.removeGroupMember({ channelId: 'group', botSlug: 'peer' }),
        () => run.channels.leaveGroup({ channelId: 'group' }),
      ];
      for (const action of actions) expect(action).toThrow('tob-cli-required');
      const sent = await run.channels.send({ body: 'I can manage groups from this private DM.' });
      expect(sent.body).toBe('I can manage groups from this private DM.');
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Create a group',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('keeps ordinary Group tools working but prevents inviting or approving protected Tob', async () => {
    let checked = false;
    let tobSlug!: string;
    const f = fixture(async (run) => {
      if (run.bot.slug !== 'owner') return;
      const group = run.channels.createGroup('Ordinary Group');
      expect(group.members).toContain('owner');
      expect(() =>
        run.channels.inviteGroup({ channelId: group.id, targetBotSlug: tobSlug }),
      ).toThrow('protected-bot');
      const invitation = run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'peer' });
      expect(invitation.targetBotSlug).toBe('peer');
      const request = f.core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: tobSlug,
        requesterBotCreatedAt: f.core.registry.get(tobSlug)!.createdAt,
      });
      expect(() =>
        run.channels.decideGroupJoin!({ channelId: group.id, requestId: request.id, accept: true }),
      ).toThrow('protected-bot');
      expect(f.core.channels.get(group.id)?.members).not.toContain(tobSlug);
      const peerRequest = f.core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'another-peer',
        requesterBotCreatedAt: f.core.registry.get('another-peer')!.createdAt,
      });
      const decided = run.channels.decideGroupJoin!({
        channelId: group.id,
        requestId: peerRequest.id,
        accept: true,
      });
      expect(decided.channel.members).toContain('another-peer');
      checked = true;
    });
    try {
      tobSlug = (await f.core.tob.ensure()).botSlug;
      for (const slug of ['owner', 'peer', 'another-peer'])
        f.core.registry.create({ slug, displayName: slug });
      const dm = f.core.channels.getOrCreateDm('owner', 'owner')!;
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Create a group',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
});

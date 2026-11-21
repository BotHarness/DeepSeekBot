import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTobService } from '../src/tob/service.js';
import * as memoryGit from '../src/memory/git.js';
import {
  bob,
  alice,
  fixture,
  createBot,
  legacyMemberTob,
  send,
} from './team-member-lifecycle-fixtures.js';

describe('M2 × M9 member lifecycle integration', { timeout: 60_000 }, () => {
  it('transfers private Bots and former member Tobs with their history', async () => {
    const f = fixture();
    const original = createBot(f);
    createBot(f, alice, 'alice-bot');
    const tob = legacyMemberTob(f);
    writeFileSync(join(original.memory, 'transferred.md'), 'private transferred memory');
    const group = f.core.channels.createGroup(owner, {
      name: 'Bot group',
      members: [original.bot.slug],
    });
    f.db.transaction((db) =>
      db
        .prepare(
          "INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) VALUES (?, 'bob', 'Bob', 1, '2026-11-14T00:00:00Z')",
        )
        .run(group.id),
    );
    await f.core.channels.appendMessage(bob, original.dm.id, {
      id: 'history',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: bob.humanId },
      body: 'history retained for transferred Bot',
    });
    expect(f.core.team.transferPreview(owner, 'bob').bots).toEqual([
      { slug: 'bob-bot', displayName: 'bob-bot' },
      { slug: 'legacy-tob', displayName: 'legacy-tob' },
    ]);
    const controller = new AbortController();
    const rosters = [bob, alice].map((human) =>
      f.core.live.followRoster(human, controller.signal)[Symbol.asyncIterator](),
    );
    await Promise.all(rosters.map((roster) => roster.next()));
    const changed = rosters.map((roster) => roster.next());
    try {
      await f.core.team.transfer(owner, 'bob', 'alice');
      expect(await Promise.all(changed)).toMatchObject([{ done: true }, { done: true }]);
    } finally {
      controller.abort();
      await Promise.all(rosters.map((roster) => roster.return?.()));
    }

    expect(f.core.registry.list('bob')).toEqual([]);
    expect(
      f.core.registry
        .list('alice')
        .map((bot) => bot.slug)
        .sort(),
    ).toEqual(['alice-bot', 'bob-bot', 'legacy-tob']);
    expect(f.core.tob.slug(bob)).toBeUndefined();
    expect(f.core.registry.get(tob.botSlug)?.ownerHumanId).toBe('alice');
    expect(f.core.team.belongs(alice, group.id)).toBe(true);
    expect(
      readFileSync(
        join(f.core.registry.memoryDirFor(original.bot.slug)!, 'transferred.md'),
        'utf8',
      ),
    ).toBe('private transferred memory');
    const methods = createBridgeMethodsForHumans(f.core);
    expect(methods(bob).get({ slug: 'bob-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(methods(alice).get({ slug: 'bob-bot' })).toMatchObject({ ok: true });
    expect(f.core.channels.readMessages(original.dm.id)[0]?.body).toBe(
      'history retained for transferred Bot',
    );
  });

  it('preserves unstamped private DM participants across ownership transfer without sharing their history', async () => {
    const f = fixture();
    const original = createBot(f);
    const unrelated = createBot(f, alice, 'alice-bot');
    expect(original.dm.dmHumanId).toBeUndefined();
    await f.core.channels.appendMessage(bob, original.dm.id, {
      id: 'bob-private-history',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob' },
      body: 'Bob private history',
    });
    await f.core.team.transfer(owner, 'bob', 'alice');
    const aliceDm = f.core.team.bots.dm(alice, original.bot.slug)!;
    expect(aliceDm.id).not.toBe(original.dm.id);
    expect(f.core.channels.readMessages(aliceDm.id)).toEqual([]);
    expect(f.core.channels.get(original.dm.id)?.dmHumanId).toBe('bob');
    expect(f.core.team.channelAccess.canRead(alice, original.dm.id)).toBe(false);
    expect(f.core.team.channelAccess.canRead(bob, original.dm.id)).toBe(true);
    expect(f.core.channels.get(unrelated.dm.id)?.dmHumanId).toBeUndefined();
    await f.core.team.transfer(owner, 'alice', 'bob');
    expect(f.core.team.bots.dm(bob, original.bot.slug)?.id).toBe(original.dm.id);
    expect(f.core.channels.get(aliceDm.id)?.dmHumanId).toBe('alice');
    expect(f.core.team.channelAccess.canRead(bob, aliceDm.id)).toBe(false);
    expect(f.core.channels.readMessages(original.dm.id)[0]?.body).toBe('Bob private history');
  });

  it('stops the transferred Bot and rejects queued turns captured under the former owner', async () => {
    const options = { running: true };
    const f = fixture(options);
    createBot(f);
    const admission = await send(f, 'bob-bot', 'first-turn');
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) throw new Error(admission.reason);
    await Promise.race([f.firstRun, admission.settled]);
    expect(f.runs).toHaveBeenCalledOnce();
    await send(f, 'bob-bot', 'queued-turn');
    await f.core.team.transfer(owner, 'bob', 'alice');
    expect(f.runs).toHaveBeenCalledOnce();
    expect(f.stop.mock.calls.map(([slug]) => slug)).toContain('bob-bot');
    options.running = false;
    const aliceDm = f.core.team.bots.dm(alice, 'bob-bot')!;
    expect(aliceDm.id).not.toBe('dm-bob-bot');
    expect(f.core.team.channelAccess.canRead(alice, 'dm-bob-bot')).toBe(false);
    await f.core.channels.appendMessage(alice, aliceDm.id, {
      id: 'new-owner',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'alice' },
      body: 'new owner request',
    });
    expect(
      f.core.runtime.admitDmMessage(alice, {
        channelId: aliceDm.id,
        messageId: 'new-owner',
        body: 'new owner request',
      }).admitted,
    ).toBe(true);
    await f.core.runtime.whenIdle();
    expect(f.runs.mock.calls.map(([run]) => run.bot.ownerHumanId)).toEqual(['bob', 'alice']);
  });

  it('refuses member Tob setup before touching Workspace grants, including after offboarding', async () => {
    const f = fixture();
    const ensureWorkspace = vi.fn();
    const tob = createTobService({
      database: f.db,
      registry: f.core.registry,
      channels: f.core.channels,
      workspaceRoot: join(f.dshHome, 'pending-tob-workspaces'),
      grants: f.core.grants,
      ensureWorkspace,
    });
    await expect(tob.ensure(bob)).rejects.toMatchObject({ code: 'tob-unavailable' });
    await f.core.team.deactivate(owner, 'bob');
    const preview = f.core.team.purgePreview(owner, 'bob');
    expect(preview.counts).toEqual({ bots: 0, channels: 0, messages: 0, files: 0 });
    await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
    await expect(tob.ensure(bob)).rejects.toMatchObject({ code: 'tob-unavailable' });
    expect(ensureWorkspace).not.toHaveBeenCalled();
    expect(tob.slug(bob)).toBeUndefined();
  });

  it('drains member-owned Memory preparation before deactivation and concurrent purge complete', async () => {
    const f = fixture();
    let releasePreparation = (): void => {};
    const preparation = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const initialize = memoryGit.initializeMemoryRepositoryAsync;
    const held = vi
      .spyOn(memoryGit, 'initializeMemoryRepositoryAsync')
      .mockImplementationOnce(async (memoryDir) => {
        await preparation;
        return initialize(memoryDir);
      });
    const preparing = f.core.registry.createAsync(
      { slug: 'preparing-bob', displayName: 'Preparing', ownerHumanId: 'bob' },
      () => {
        if (f.core.team.member('bob')?.status !== 'active') throw new Error('member-unavailable');
      },
    );
    const rejected = expect(preparing).rejects.toThrow('member-unavailable');
    let deactivated = false;
    const deactivating = f.core.team.deactivate(owner, 'bob').then(() => {
      deactivated = true;
    });
    let purgeSettled = false;
    let purgeRejection: Promise<void> | undefined;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(deactivated).toBe(false);
      expect(f.core.team.member('bob')?.status).toBe('deactivated');
      const preview = f.core.team.purgePreview(owner, 'bob');
      const purging = f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob').finally(() => {
        purgeSettled = true;
      });
      purgeRejection = expect(purging).rejects.toMatchObject({ code: 'purge-token-invalid' });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(purgeSettled).toBe(false);
      expect(f.core.team.member('bob')).toBeDefined();
      expect(existsSync(join(f.dshHome, 'spaces', bob.humanId))).toBe(true);
    } finally {
      releasePreparation();
      await Promise.allSettled([rejected, deactivating, purgeRejection]);
      held.mockRestore();
    }
    await rejected;
    await deactivating;
    await purgeRejection;
    expect(deactivated).toBe(true);
    expect(purgeSettled).toBe(true);
    expect(f.core.team.member('bob')).toBeDefined();
    const preview = f.core.team.purgePreview(owner, 'bob');
    await f.core.team.purgeConfirm(owner, 'bob', preview.token, 'bob');
    expect(f.core.tob.slug(bob)).toBeUndefined();
    expect(f.core.team.member('bob')).toBeUndefined();
    expect(f.core.registry.get('preparing-bob')).toBeUndefined();
    expect(existsSync(join(f.dshHome, 'spaces', bob.humanId))).toBe(false);
  });

  it('does not publish a Tob when Host ownership changes during Memory preparation', async () => {
    const f = fixture();
    const preparing = f.core.tob.ensure(owner);
    const rejected = expect(preparing).rejects.toMatchObject({ code: 'tob-identity-unavailable' });
    const slug = f.core.tob.slug(owner);
    if (!slug) throw new Error('Tob identity was not reserved');
    f.db.transaction((db) => {
      db.prepare("UPDATE team_settings SET owner_human_id = 'bob'").run();
    });
    await rejected;
    expect(f.core.registry.get(slug)).toBeUndefined();
    expect(f.core.tob.slug(owner)).toBeUndefined();
  });

  it.each(['deactivate', 'off'] as const)(
    '%s stops existing turns and blocks private Bot and Tob admission without changing explicit pause settings',
    async (operation) => {
      const f = fixture({ running: true });
      const bot = createBot(f);
      createBot(f, bob, 'paused-bot');
      expect(f.core.registry.setPaused('paused-bot', true)).toMatchObject({ ok: true });
      const tob = legacyMemberTob(f);
      const group = f.core.channels.createGroup(bob, { name: 'Mentions', members: ['bob-bot'] });
      const schedule = f.core.schedules.create(
        'bob-bot',
        {
          title: 'Blocked schedule',
          prompt: 'Must not run',
          trigger: { kind: 'every', everySeconds: 3600 },
        },
        'human',
      );
      const result = await send(f, 'bob-bot', 'running');
      expect(result.admitted).toBe(true);
      if (!result.admitted) throw new Error(result.reason);
      await Promise.race([f.firstRun, result.settled]);
      expect(f.runs).toHaveBeenCalledOnce();
      if (operation === 'deactivate') await f.core.team.deactivate(owner, 'bob');
      else await f.core.team.setMode(owner, false);
      expect(f.stop.mock.calls.map(([slug]) => slug)).toContain('bob-bot');
      expect(f.stop.mock.calls.map(([slug]) => slug)).toContain(tob.botSlug);
      expect(f.core.registry.get('bob-bot')?.paused).toBeUndefined();
      await expect(send(f, 'bob-bot', 'blocked')).rejects.toMatchObject({
        code: 'bot-dm-read-only',
      });
      await expect(send(f, tob.botSlug, 'blocked-tob')).rejects.toMatchObject({
        code: 'bot-dm-read-only',
      });
      await expect(
        f.core.channels.appendMessage(bob, group.id, {
          id: 'blocked-mention',
          at: new Date().toISOString(),
          author: { kind: 'human', humanId: 'bob' },
          body: '@bob-bot must not run',
          mentions: [{ botSlug: 'bob-bot', label: 'bob-bot', start: 0, end: 8 }],
        }),
      ).rejects.toMatchObject({ code: 'channel-not-found' });
      f.core.runtime.admitGroupMessage(group.id, 'blocked-mention');
      f.core.schedules.runNow('bob-bot', schedule.id);
      await f.core.runtime.whenIdle();
      expect(f.runs).toHaveBeenCalledOnce();
      expect(existsSync(bot.memory)).toBe(true);
      if (operation === 'deactivate') await f.core.team.reactivate(owner, 'bob');
      else {
        await f.core.team.setOwnerPassword(owner, 'owner-password-1');
        await f.core.team.setMode(owner, true);
      }
      expect(f.core.team.member('bob')?.status).toBe('active');
      expect(f.core.tob.slug(bob)).toBeUndefined();
      expect(f.core.registry.get('bob-bot')?.ownerHumanId).toBe('bob');
      expect(f.core.registry.get('paused-bot')?.paused).toBe(true);
    },
  );
});

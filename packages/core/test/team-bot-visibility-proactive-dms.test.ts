import {
  alice,
  bob,
  closes,
  everyone,
  fixture,
  post,
  proactiveFixture,
  publicBot,
} from './team-bot-visibility-fixtures.js';
import { describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTeamBridge } from '../src/team/bridge.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

describe('M7 Bot principal and participant authority', () => {
  describe.each([true, false])('principal proactive DMs (Team mode %s)', (teamEnabled) => {
    it.each(['channel_id', 'human_id'] as const)(
      'sends through %s with the switch off despite a principal opt-out',
      async (destination) => {
        const { core, dm } = proactiveFixture(teamEnabled);
        core.team.bots.optOut(owner, 'helper', true);
        expect(core.team.bots.view(owner, 'helper').switches.proactiveDms).toBe(false);
        const sent = await core.runtime.runDirectBotTool!(
          'helper',
          'bot_send_message',
          { [destination]: destination === 'channel_id' ? dm.id : owner.humanId, body: 'Reminder' },
          new AbortController().signal,
        );
        expect(sent.result).toMatchObject({ channelId: dm.id, status: 'committed' });
        expect(core.channels.readMessages(dm.id)).toContainEqual(
          expect.objectContaining({ body: 'Reminder', author: { kind: 'bot', slug: 'helper' } }),
        );
      },
    );
  });
  it.each(['channel_id', 'human_id'] as const)(
    'keeps audience, switch and member opt-out checks for proactive %s sends',
    async (destination) => {
      const { core } = proactiveFixture(true);
      core.team.bots.setVisibility(owner, 'helper', everyone);
      const dm = core.team.bots.dm(bob, 'helper')!;
      const send = () =>
        core.runtime.runDirectBotTool!(
          'helper',
          'bot_send_message',
          { [destination]: destination === 'channel_id' ? dm.id : bob.humanId, body: 'Report' },
          new AbortController().signal,
        );
      await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
      core.team.bots.switches(owner, 'helper', { proactiveDms: true });
      core.team.bots.optOut(bob, 'helper', true);
      await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
      core.team.bots.optOut(bob, 'helper', false);
      await expect(send()).resolves.toMatchObject({ result: { status: 'committed' } });
      core.team.bots.setVisibility(
        owner,
        'helper',
        {
          kind: 'public',
          audience: { kind: 'members', humanIds: [owner.humanId] },
        },
        true,
      );
      expect(() => core.team.bots.requireProactive('helper', bob.humanId)).toThrow(
        'bot-proactive-denied',
      );
    },
  );
  it('exempts the current principal immediately after transfer, while the former principal is audience', async () => {
    const { core, db, dm: formerPrincipalDm } = proactiveFixture(true);
    core.team.bots.setVisibility(owner, 'helper', everyone);
    const currentPrincipalDm = core.team.bots.dm(bob, 'helper')!;
    core.team.bots.optOut(bob, 'helper', true);
    db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='bob',body=json_set(body,'$.ownerHumanId','bob') WHERE slug='helper'",
        )
        .run(),
    );
    const send = (channelId: string) =>
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { channel_id: channelId, body: 'Transferred report' },
        new AbortController().signal,
      );
    await expect(send(currentPrincipalDm.id)).resolves.toMatchObject({
      result: { status: 'committed' },
    });
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { human_id: bob.humanId, body: 'Transferred reminder' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ result: { channelId: currentPrincipalDm.id, status: 'committed' } });
    await expect(send(formerPrincipalDm.id)).rejects.toMatchObject({
      code: 'bot-proactive-denied',
    });
    core.team.bots.switches(bob, 'helper', { proactiveDms: true });
    core.team.bots.optOut(owner, 'helper', true);
    await expect(send(formerPrincipalDm.id)).rejects.toMatchObject({
      code: 'bot-proactive-denied',
    });
    core.team.bots.optOut(owner, 'helper', false);
    await expect(send(formerPrincipalDm.id)).resolves.toMatchObject({
      result: { status: 'committed' },
    });
    expect(core.registry.setPaused('helper', true).ok).toBe(true);
    expect(() => core.team.bots.requireProactive('helper', bob.humanId)).toThrow(
      'bot-principal-inactive',
    );
  });
  it('requires audience, proactive opt-in and respects each member opt-out', () => {
    const f = fixture();
    publicBot(f);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).toThrow('bot-proactive-denied');
    f.team.bots.switches(alice, 'alice-bot', { proactiveDms: true });
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).not.toThrow();
    f.team.bots.optOut(bob, 'alice-bot', true);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).toThrow('bot-proactive-denied');
    f.team.bots.optOut(bob, 'alice-bot', false);
    expect(() => f.team.bots.requireProactive('alice-bot', 'bob')).not.toThrow();
  });
  it('uses participant authority for private→public Bot DMs and denies public→private initiation', () => {
    const f = fixture();
    publicBot(f);
    expect(() => f.team.bots.requireBotTarget('bob-bot', 'alice-bot')).not.toThrow();
    expect(() => f.team.bots.requireBotTarget('alice-bot', 'bob-bot')).toThrow(
      'bot-private-target-denied',
    );
    const channel = f.channels.getOrCreateBotDm(bob, 'bob-bot', 'alice-bot', 'DM')!;
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(true);
    f.db.transaction((db) =>
      db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
    );
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
  });
  it('never delegates M11 to a Bot, including Owner Bots', async () => {
    const f = fixture();
    for (const human of [owner, alice])
      for (const method of [
        'privateObjects',
        'privateContentOpen',
        'privateContentPage',
        'auditLog',
        'auditVerify',
      ] as const)
        expect(
          await createTeamBridge({ ...human, caller: 'bot' }, f.team)[method]({}),
        ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  });
  it.each(['role', 'remove', 'deactivate'] as const)(
    'refuses a live turn before its next tool and send after %s',
    async (kind) => {
      let captured: OrchestratorAgentRun | undefined;
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const core = createCore({
        dshHome: createTempRoot('m7-live-'),
        agents: {
          async runOrchestrator(run) {
            captured = run;
            await wait;
          },
          async runAssignment() {},
          requestAssignment() {
            throw new Error('unexpected');
          },
          async close() {},
        },
      });
      closes.push(async () => {
        release();
        await core.runtime.close();
        core.operationalDatabase.close();
      });
      const db = attachOperationalModule(core.operationalDatabase, 'team');
      db.transaction((db) => {
        db.prepare("INSERT INTO humans VALUES ('alice','Alice','active','now')").run();
        db.prepare("INSERT INTO human_roles VALUES ('alice','member')").run();
        db.prepare('UPDATE team_settings SET enabled=1').run();
      });
      core.team.spaces.ensureAccount('alice');
      expect(
        core.registry.create({ slug: 'worker', displayName: 'Worker', ownerHumanId: 'alice' }).ok,
      ).toBe(true);
      const group = core.channels.createGroup(owner, { name: 'Restricted', members: ['worker'] });
      const role = core.team.roles.create(owner, 'Finance', []).role;
      core.team.roles.set(owner, 'alice', [role.roleId]);
      core.team.channelAccess.visibilitySet(owner, group.id, {
        kind: 'roles',
        roleIds: [role.roleId],
      });
      await core.channels.appendMessage(owner, group.id, {
        ...post('start'),
        body: '@Worker start',
        mentions: [{ botSlug: 'worker', label: 'Worker', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, 'start');
      for (let i = 0; i < 200 && !captured; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      if (!captured) throw new Error('turn-not-started');
      expect(() => captured!.channels.read({ channelId: group.id })).not.toThrow();
      if (kind === 'role') core.team.roles.set(owner, 'alice', []);
      if (kind === 'remove')
        db.transaction((db) =>
          db
            .prepare(
              "UPDATE channel_human_members SET left_at='now' WHERE channel_id=? AND human_id='alice'",
            )
            .run(group.id),
        );
      if (kind === 'deactivate')
        db.transaction((db) =>
          db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
        );
      expect(() => captured!.channels.read({ channelId: group.id })).toThrow();
      await expect(
        captured.channels.send({ channelId: group.id, body: 'forbidden' }),
      ).rejects.toThrow();
      expect(() => captured!.requireContent!()).toThrow();
      release();
      await core.runtime.whenIdle();
    },
  );
});

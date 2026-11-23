import {
  alice,
  bob,
  carol,
  closes,
  everyone,
  fixture,
  post,
  proactiveFixture,
  publicBot,
} from './team-bot-visibility-fixtures.js';
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';

describe('M7 Bot principal and participant authority', () => {
  it('binds authenticated direct tools to the caller DM and releases the transient origin', async () => {
    const root = createTempRoot('m7-direct-approval-origin-');
    let core: ReturnType<typeof createCore>;
    let sessionId: string | undefined;
    let observedOrigin: string | undefined;
    core = createCore({
      dshHome: root,
      agents: createDshBotAgentAdapter({
        agents: new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => {} }),
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => join(root, 'memory'),
        onAgentSetup: (_ctx, agent) => {
          sessionId = agent.session.id;
          observedOrigin = core.runtime.askChannel?.(sessionId);
        },
      }),
    });
    closes.push(async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    const db = attachOperationalModule(core.operationalDatabase, 'direct-approval-origin-test');
    db.transaction((sql) => {
      sql.prepare('UPDATE team_settings SET enabled=1').run();
      sql.prepare("INSERT INTO humans VALUES ('alice','Alice','active','now')").run();
      sql.prepare("INSERT INTO human_roles VALUES ('alice','member')").run();
    });
    core.spaces.ensureAccount(alice.humanId);
    expect(
      core.registry.create({ slug: 'helper', displayName: 'Helper', ownerHumanId: alice.humanId })
        .ok,
    ).toBe(true);
    const dm = core.channels.getOrCreateDm(alice, 'helper', 'Helper')!;
    const result = await createBridgeMethodsForHumans(core)(alice).botToolRun({
      slug: 'helper',
      tool: 'bot_send_message',
      args: { body: 'No target, no delivery.' },
      humanId: owner.humanId,
    });
    expect(result.ok).toBe(false);
    expect(observedOrigin).toBe(dm.id);
    expect(sessionId).toBeDefined();
    expect(core.runtime.askChannel?.(sessionId!)).toBeUndefined();
    expect(core.channels.readMessages(dm.id)).toEqual([]);
  });
  it.each([{ operationKey: '' }, { expectedChannel: '' }, { operationKey: 'unsupported' }])(
    'does not persist invitation provenance after rejected input %j',
    (input) => {
      const f = fixture();
      const group = f.channels.createGroup(alice, { name: 'Invite', members: [] });
      const result = f
        .bridge(alice)
        .channelGroupInvite({ channelId: group.id, botSlug: 'alice-bot', ...input });
      expect(result.ok).toBe(false);
      expect(
        f.db.read((db) =>
          db.prepare('SELECT * FROM bot_channel_adders WHERE channel_id=?').all(group.id),
        ),
      ).toEqual([]);
      expect(f.channels.get(group.id)?.invitations ?? []).toEqual([]);
    },
  );
  it('keeps Bot DM authorization tied to the recorded participant after either Bot transfers', () => {
    const f = fixture();
    publicBot(f);
    const channel = f.channels.getOrCreateBotDm(bob, 'bob-bot', 'alice-bot', 'DM')!;
    f.db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id='carol',body=json_set(body,'$.ownerHumanId','carol') WHERE slug='bob-bot'",
        )
        .run(),
    );
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(true);
    f.team.bots.setVisibility(
      owner,
      'alice-bot',
      { kind: 'public', audience: { kind: 'members', humanIds: ['carol'] } },
      true,
    );
    expect(f.team.bots.canRead('alice-bot', channel)).toBe(false);
    expect(f.team.bots.canRead('bob-bot', channel)).toBe(false);
  });
  it('does not exempt direct sends merely because the participant DM has historical placements', async () => {
    const { core, db } = proactiveFixture(true);
    core.team.bots.setVisibility(owner, 'helper', everyone);
    const dm = core.team.bots.dm(bob, 'helper')!;
    await core.channels.appendMessage(bob, dm.id, post('past-turn'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'past-turn',
      body: 'past-turn',
    });
    if (!admission.admitted) throw new Error('not-admitted');
    await admission.settled;
    const source = db.read((db) =>
      db
        .prepare(
          'SELECT source_event_id FROM channel_placements WHERE channel_id=? AND message_id=?',
        )
        .get(dm.id, 'past-turn'),
    );
    const send = () =>
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { channel_id: dm.id, body: 'unsolicited' },
        new AbortController().signal,
      );
    await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { source_event_id: source?.['source_event_id'], body: 'explicit reply' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ result: { status: 'committed' } });
    core.team.bots.switches(owner, 'helper', { proactiveDms: true });
    core.team.bots.optOut(bob, 'helper', true);
    await expect(send()).rejects.toMatchObject({ code: 'bot-proactive-denied' });
  });
  it('reattaches speaker policy after refused steering and commits only accepted delivery', async () => {
    let release = () => {};
    let started = () => {};
    const active = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const steered: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-steer-policy-'),
      agents: {
        async runOrchestrator() {
          started();
          await active;
        },
        steerOrchestrator(_slug, text) {
          steered.push(text);
          return steered.length > 1;
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
    core.registry.create({ slug: 'worker', displayName: 'Worker' });
    const dm = core.channels.getOrCreateDm(owner, 'worker')!;
    const group = core.channels.createGroup(owner, { name: 'Steer policy', members: ['worker'] });
    await core.channels.appendMessage(owner, dm.id, post('start'));
    const admission = core.runtime.admitDmMessage(owner, {
      channelId: dm.id,
      messageId: 'start',
      body: 'start',
    });
    if (!admission.admitted) throw new Error('not-admitted');
    await ready;
    core.team.roles.update(owner, 'member', {
      policy: [{ topic: 'steer', effect: 'deny', text: 'Retry policy' }],
    });
    const db = attachOperationalModule(core.operationalDatabase, 'steer-policy-test');
    db.transaction((db) =>
      db.prepare("INSERT OR IGNORE INTO human_roles VALUES ('local-human','member')").run(),
    );
    const attached = () =>
      db.read((db) =>
        db.prepare("SELECT revision FROM session_speaker_policies WHERE role_id='member'").all(),
      );
    for (const id of ['refused', 'accepted']) {
      await core.channels.appendMessage(owner, group.id, {
        ...post(id),
        body: '@Worker check',
        mentions: [{ botSlug: 'worker', label: 'Worker', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, id);
      if (id === 'refused') expect(attached()).toEqual([]);
    }
    expect(steered).toHaveLength(2);
    for (const text of steered) expect(text).toContain('Retry policy');
    expect(attached()).toEqual([{ revision: 2 }]);
    release();
    await admission.settled;
    await core.runtime.whenIdle();
  });
  it('keeps exactly one DM per Human/Bot, excludes principal and retains read-only history after audience shrink', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(dm.id);
    expect(f.team.bots.dm(carol, 'alice-bot')!.id).not.toBe(dm.id);
    await f.channels.appendMessage(bob, dm.id, post('bob-private'));
    for (const h of [alice, owner, carol]) {
      expect(f.team.channelAccess.canRead(h, dm.id)).toBe(false);
      expect(await f.bridge(h).channelMessages({ channelId: dm.id })).toMatchObject({ ok: false });
    }
    expect(f.team.bots.canRead('alice-bot', dm)).toBe(true);
    expect(
      await f
        .bridge(alice)
        .botToolRun({ slug: 'alice-bot', tool: 'channel_read', args: { channel_id: dm.id } }),
    ).toMatchObject({ ok: false, error: { code: 'bot-session-private' } });
    expect(await f.bridge(alice).botToolTrace({ slug: 'alice-bot' })).toMatchObject({
      ok: false,
      error: { code: 'bot-session-private' },
    });

    f.states.setSessionState(
      'alice-bot',
      'foreign-session',
      'working',
      {
        effect: 'executing',
        toolKind: 'execute',
        toolName: 'private-tool',
        publicDetail: 'participant-secret-tool-input',
        detailRefs: [],
        activeToolCount: 1,
        startedAt: 1,
      },
      'assignment',
      'participant-secret-title',
    );
    expect(f.bridge(alice).get({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: { bot: { sessions: {} } },
    });
    const snapshot = f.bridge(alice).activitySnapshot({});
    expect(snapshot).toMatchObject({
      ok: true,
      value: { bots: [expect.objectContaining({ slug: 'alice-bot', sessions: [] })] },
    });
    expect(JSON.stringify(snapshot)).not.toContain('participant-secret');
    expect(
      JSON.stringify(
        f.team.approvals.project(alice, {
          bots: [
            {
              slug: 'alice-bot',
              activity: { publicDetail: 'participant-secret-live-tool' },
              sessions: [{ title: 'participant-secret-live-title' }],
            },
          ],
        }),
      ),
    ).not.toContain('participant-secret');
    const beforeProjection = f.database.diagnostics().metrics.reads;
    const privateActivities = f.team.approvals.project(alice, {
      bots: Array.from({ length: 100 }, () => ({
        slug: 'alice-bot',
        sessions: [{ title: 'participant-secret' }],
      })),
    });
    expect(f.database.diagnostics().metrics.reads - beforeProjection).toBe(1);
    expect(JSON.stringify(privateActivities)).not.toContain('participant-secret');
    const preview = f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' });
    expect(preview).toMatchObject({
      applied: false,
      preview: {
        dmsBecomingReadOnly: expect.arrayContaining([{ channelId: dm.id, humanId: 'bob' }]),
      },
    });
    expect(f.team.bots.canReach(bob, 'alice-bot')).toBe(true);
    expect(f.team.bots.setVisibility(alice, 'alice-bot', { kind: 'private' }, true).applied).toBe(
      true,
    );
    expect(f.team.channelAccess.canRead(bob, dm.id)).toBe(true);
    expect(f.team.bots.canRead('alice-bot', dm)).toBe(false);
    await expect(f.channels.appendMessage(bob, dm.id, post('blocked'))).rejects.toMatchObject({
      code: 'bot-dm-read-only',
    });
    await expect(
      f.channels.appendMessage(alice, dm.id, post('no-reply', 'bot')),
    ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
  });
  it.each(['audience-role', 'principal-deactivate'] as const)(
    'stops participant DM writes and Bot replies immediately after %s',
    async (change) => {
      const f = fixture();
      const audience = f.team.roles.create(owner, 'DM audience', []).role;
      f.team.roles.set(owner, bob.humanId, [audience.roleId]);
      f.team.bots.setVisibility(owner, 'alice-bot', {
        kind: 'public',
        audience: { kind: 'roles', roleIds: [audience.roleId] },
      });
      const dm = f.team.bots.dm(bob, 'alice-bot')!;
      await f.channels.appendMessage(bob, dm.id, post('before-revocation'));
      expect(f.team.bots.canRead('alice-bot', dm)).toBe(true);
      if (change === 'audience-role') f.team.roles.set(owner, bob.humanId, ['member']);
      else
        f.db.transaction((db) =>
          db.prepare("UPDATE humans SET status='deactivated' WHERE human_id='alice'").run(),
        );
      expect(f.team.channelAccess.canRead(bob, dm.id)).toBe(true);
      expect(f.team.bots.canRead('alice-bot', dm)).toBe(false);
      await expect(
        f.channels.appendMessage(bob, dm.id, post('after-revocation')),
      ).rejects.toMatchObject({ code: 'bot-dm-read-only' });
      await expect(
        f.channels.appendMessage(alice, dm.id, post('blocked-reply', 'bot')),
      ).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
    },
  );
  it.each(['existing live', 'recreated'] as const)(
    'resolves the %s participant DM instead of a deleted DM',
    (kind) => {
      const f = fixture();
      const dm = f.channels.getOrCreateDm(alice, 'alice-bot')!;
      f.db.transaction((db) => {
        if (kind === 'existing live') {
          const deleted = { ...dm, id: 'dm-000-deleted', dmHumanId: 'alice', deletedAt: 'now' };
          db.prepare(
            'INSERT INTO channel_records(channel_id,record_json,owner_human_id) VALUES (?,?,?)',
          ).run(deleted.id, JSON.stringify(deleted), 'alice');
        } else {
          db.prepare(
            "UPDATE channel_records SET record_json=json_set(record_json,'$.deletedAt','now') WHERE channel_id=?",
          ).run(dm.id);
        }
      });
      const resolved = f.channels.getOrCreateDm(alice, 'alice-bot', dm.name)!;
      expect(resolved.id).toBe(dm.id);
      expect(resolved.deletedAt).toBeUndefined();
      expect(f.channels.get(resolved.id)).toEqual(resolved);
    },
  );

  it('refuses DM mentions of Bots the speaking Human cannot reach', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    const mention = (slug: string) =>
      f.bridge(bob).channelSend({
        channelId: dm.id,
        body: `@${slug} hello`,
        mentions: [{ botSlug: slug, label: slug, start: 0, end: slug.length + 1 }],
      });
    expect(f.team.bots.canReach(bob, 'owner-bot')).toBe(false);
    expect(await mention('owner-bot')).toMatchObject({ ok: false });
    expect((await f.bridge(bob).channelMessages({ channelId: dm.id })) as unknown).toMatchObject({
      ok: true,
      value: { messages: [] },
    });
    expect(await mention('bob-bot')).toMatchObject({ ok: true });
  });
  it('offers a reachable shared Bot as the Skill viewer in a participant DM only while reachable', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    const list = vi.fn(async (bots: readonly string[]) => bots.map((name) => ({ name })));
    const bridge = createBridgeMethodsForHumans({
      registry: f.registry,
      channels: f.channels,
      team: f.team,
      states: f.states,
      ownership: createTestOwnership(),
      roster: createTestRosterStore({ database: f.database }),
      skills: { list } as never,
    });
    expect(await bridge(bob).channelSkillCatalog({ channelId: dm.id })).toMatchObject({ ok: true });
    expect(list).toHaveBeenLastCalledWith(['alice-bot']);
    f.team.bots.setVisibility(owner, 'alice-bot', { kind: 'private' }, true);
    await bridge(bob).channelSkillCatalog({ channelId: dm.id });
    expect(list).toHaveBeenLastCalledWith([]);
  });
  it('refuses reactions in a participant DM once its Bot is no longer reachable', async () => {
    const f = fixture();
    publicBot(f);
    const dm = f.team.bots.dm(bob, 'alice-bot')!;
    await f.channels.appendMessage(bob, dm.id, post('bob-reaction'));
    const react = () =>
      f.bridge(bob).channelReact({ channelId: dm.id, messageId: 'bob-reaction', emoji: '👍' });
    expect(await react()).toMatchObject({ ok: true });
    f.team.bots.setVisibility(owner, 'alice-bot', { kind: 'private' }, true);
    expect(await react()).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
  it('never reuses another Human/Bot pair when a Bot slug matches a participant DM id', () => {
    const f = fixture();
    publicBot(f);
    const participant = f.team.bots.dm(bob, 'alice-bot')!;
    expect(participant.id).toMatch(/^dm-member-/);
    const collidingSlug = participant.id.slice('dm-'.length);
    expect(
      f.registry.create({ slug: collidingSlug, displayName: 'Collider', ownerHumanId: 'bob' }).ok,
    ).toBe(true);
    const own = f.channels.getOrCreateDm(bob, collidingSlug, 'Collider')!;
    expect(own.id).not.toBe(participant.id);
    expect(own).toMatchObject({ type: 'dm', botSlug: collidingSlug });
    expect(f.channels.get(participant.id)).toMatchObject({
      botSlug: 'alice-bot',
      dmHumanId: 'bob',
    });
    expect(f.channels.getOrCreateDm(bob, collidingSlug, 'Collider')!.id).toBe(own.id);
    expect(f.team.bots.dm(bob, 'alice-bot')!.id).toBe(participant.id);
    expect(f.team.bots.dm(bob, collidingSlug)!.id).toBe(own.id);
  });
  it('delivers a public Bot reply only to its Human participant and scopes Activity to that participant', async () => {
    const inputs: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-participant-runtime-'),
      agents: {
        async runOrchestrator(run) {
          inputs.push(run.message);
          await run.channels.send({
            channelId: run.inboundChannelId!,
            body: 'participant-secret-answer',
          });
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('unexpected');
        },
        async close() {},
      },
    });
    closes.push(async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    const db = attachOperationalModule(core.operationalDatabase, 'team');
    db.transaction((db) => {
      db.prepare('UPDATE team_settings SET enabled=1').run();
      for (const id of ['alice', 'bob']) {
        db.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
        db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
      }
    });
    core.team.spaces.ensureAccount('alice');
    expect(
      core.registry.create({ slug: 'public-helper', displayName: 'Helper', ownerHumanId: 'alice' })
        .ok,
    ).toBe(true);
    core.channels.getOrCreateDm(alice, 'public-helper');
    core.team.bots.setVisibility(owner, 'public-helper', everyone);
    const dm = core.team.bots.dm(bob, 'public-helper')!;
    await core.channels.appendMessage(bob, dm.id, post('participant-secret-request'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'participant-secret-request',
      body: 'participant-secret-request',
    });
    expect(admission.admitted).toBe(true);
    if (admission.admitted) await admission.settled;
    expect(inputs[0]).toContain('[bob · member]');
    expect(core.channels.readMessages(dm.id).map((m) => m.body)).toContain(
      'participant-secret-answer',
    );
    expect(core.channels.readMessages('dm-public-helper')).toEqual([]);
    expect(core.humanAttention.dmReplies(bob, 20).map((m) => m.channelId)).toContain(dm.id);
    for (const viewer of [alice, owner]) {
      expect(
        JSON.stringify(createBridgeMethodsForHumans(core)(viewer).botSessionIds({})),
      ).not.toContain('public-helper');
      expect(core.humanAttention.dmReplies(viewer, 20)).toEqual([]);
      expect(JSON.stringify(core.humanAttention.list(viewer, {}))).not.toContain(
        'participant-secret',
      );
    }
    core.team.roles.update(owner, 'member', {
      policy: [{ topic: 'answer', text: 'Updated policy', effect: 'deny' }],
    });
    await core.channels.appendMessage(bob, dm.id, post('revision-request'));
    const second = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'revision-request',
      body: 'revision-request',
    });
    if (second.admitted) await second.settled;
    expect(inputs[1]).toContain('Updated policy');
    expect(inputs[1]).toContain('"revision":2');
    core.team.bots.switches(alice, 'public-helper', { speakerContext: false });
    await core.channels.appendMessage(bob, dm.id, post('no-context'));
    const third = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'no-context',
      body: 'no-context',
    });
    if (third.admitted) await third.settled;
    expect(inputs[2]).not.toContain('[bob · member]');
  });
  it('runs private→public Bot messaging and a participant-authorized reply without tracing it into the public principal DM', async () => {
    let sent = false,
      replied = false;
    const errors: unknown[] = [];
    const core = createCore({
      dshHome: createTempRoot('m7-bot-peer-runtime-'),
      agents: {
        async runOrchestrator(run) {
          try {
            if (run.bot.slug === 'private-helper' && !sent) {
              sent = true;
              await run.channels.sendToBot({
                botSlug: 'public-helper',
                body: 'delegate-private-work',
              });
            } else if (run.bot.slug === 'public-helper' && !replied) {
              replied = true;
              expect(run.message).not.toContain('[bob ·');
              await run.channels.send({
                channelId: run.inboundChannelId!,
                body: 'peer-private-answer',
              });
            }
          } catch (e) {
            errors.push(e);
          }
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('unexpected');
        },
        async close() {},
      },
    });
    closes.push(async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    const db = attachOperationalModule(core.operationalDatabase, 'team');
    db.transaction((db) => {
      db.prepare('UPDATE team_settings SET enabled=1').run();
      for (const id of ['alice', 'bob']) {
        db.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
        db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
      }
    });
    for (const [slug, h] of [
      ['public-helper', alice],
      ['private-helper', bob],
    ] as const) {
      core.team.spaces.ensureAccount(h.humanId);
      expect(core.registry.create({ slug, displayName: slug, ownerHumanId: h.humanId }).ok).toBe(
        true,
      );
      core.channels.getOrCreateDm(h, slug);
    }
    core.team.bots.setVisibility(owner, 'public-helper', everyone);
    await core.channels.appendMessage(bob, 'dm-private-helper', post('delegate'));
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: 'dm-private-helper',
      messageId: 'delegate',
      body: 'delegate',
    });
    if (admission.admitted) await admission.settled;
    await core.runtime.whenIdle();
    expect(errors).toEqual([]);
    expect(sent && replied).toBe(true);
    const peer = core.channels.list().find((c) => c.type === 'dm' && c.members.length === 2)!;
    expect(core.channels.readMessages(peer.id).map((m) => m.body)).toEqual([
      'peer-private-answer',
      'delegate-private-work',
    ]);
    expect(core.team.channelAccess.canRead(bob, peer.id)).toBe(true);
    expect(core.team.channelAccess.canRead(alice, peer.id)).toBe(false);
    expect(core.channels.readMessages('dm-public-helper')).toEqual([]);
  });
});

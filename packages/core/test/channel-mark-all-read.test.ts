import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
};
it('marks captured Human Channel heads read, preserves requests and leaves later arrivals unread', async () => {
  const home = createTempRoot('bh-overview-read-');
  let core = createCore({ dshHome: home, agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Team',
      members: ['ada'],
    });
    const hidden = core.channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'bea', 'Private')!;
    for (const channel of [dm, group, hidden])
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'head-' + channel.id,
        ...(channel.id === hidden.id
          ? {
              botCausation: {
                rootSourceEventId: 'qa-root',
                parentSourceEventId: 'qa-parent',
                hop: 1,
              },
            }
          : {}),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Update',
        at: new Date().toISOString(),
      });
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'grant-request',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Choose workspace',
      grantRequest: true,
      at: new Date().toISOString(),
    });
    const requests = core.humanAttention.actionCount(OWNER_HUMAN_CONTEXT);
    expect(requests).toBe(1);
    const original = core.channels.markRead.bind(core.channels);
    let injected = false;
    core.channels.markRead = async (human, channelId, messageId) => {
      if (!injected) {
        injected = true;
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
          id: 'late',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Late update',
          at: new Date().toISOString(),
        });
      }
      return original(OWNER_HUMAN_CONTEXT, channelId, messageId);
    };
    const result = await createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelMarkAllRead(
      {},
    );
    expect(result).toEqual({ ok: true, value: { channels: 2 } });
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)?.messageId).toBe('grant-request');
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, group.id)?.messageId).toBe(
      'head-' + group.id,
    );
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, hidden.id)).toBeUndefined();
    expect(core.humanAttention.actionCount(OWNER_HUMAN_CONTEXT)).toBe(requests);
    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(1);
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome: home, agents });
    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(1);
    expect(core.humanAttention.actionCount(OWNER_HUMAN_CONTEXT)).toBe(1);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('excludes inaccessible heads and reports a corrupt latest placement instead of claiming success', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-all-read-access-'), agents });
  const fixture = attachOperationalModule(core.operationalDatabase, 'channels');
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Former membership',
      members: ['ada'],
    });
    const deleted = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Deleted',
      members: ['ada'],
    });
    const hidden = core.channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'bea', 'Private')!;
    for (const channel of [dm, group, deleted, hidden])
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'head-' + channel.id,
        author: { kind: 'bot', slug: 'ada' },
        body: 'Stored update',
        at: new Date().toISOString(),
        ...(channel.id === hidden.id
          ? { botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 } }
          : {}),
      });
    core.channels.deleteGroup(deleted.id);
    fixture.transaction((db) => {
      db.prepare('UPDATE channel_human_members SET left_at = ? WHERE channel_id = ?').run(
        new Date().toISOString(),
        group.id,
      );
    });
    expect(core.channels.latestHumanMessageId?.(OWNER_HUMAN_CONTEXT, hidden.id)).toBeUndefined();
    expect(core.channels.latestHumanMessageId?.(OWNER_HUMAN_CONTEXT, deleted.id)).toBeUndefined();
    expect(core.channels.latestHumanMessageId?.(OWNER_HUMAN_CONTEXT, group.id)).toBeUndefined();
    fixture.transaction((db) => {
      const result = db
        .prepare('UPDATE source_events SET payload_json = ? WHERE channel_id = ?')
        .run('{}', dm.id);
      expect(result.changes).toBeGreaterThan(0);
    });
    expect(
      await createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelMarkAllRead({}),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)).toBeUndefined();
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, hidden.id)).toBeUndefined();
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it("marks only the chosen Channel, or only the chosen Bot's Channels", async () => {
  const core = createCore({ dshHome: createTempRoot('bh-all-read-scope-'), agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    const ada = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const bea = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
    const team = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: ['ada'] });
    for (const channel of [ada, bea, team])
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'head-' + channel.id,
        author: { kind: 'bot', slug: channel.id === bea.id ? 'bea' : 'ada' },
        body: 'Update',
        at: new Date().toISOString(),
      });
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
    expect(await methods.channelMarkAllRead({ channelId: bea.id })).toEqual({
      ok: true,
      value: { channels: 1 },
    });
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, bea.id)?.messageId).toBe(
      'head-' + bea.id,
    );
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, ada.id)).toBeUndefined();
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, team.id)).toBeUndefined();
    expect(await methods.channelMarkAllRead({ botSlug: 'ada' })).toEqual({
      ok: true,
      value: { channels: 2 },
    });
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, ada.id)).toBeDefined();
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, team.id)?.messageId).toBe(
      'head-' + team.id,
    );
    expect(await methods.channelMarkAllRead({ botSlug: 'ada' })).toEqual({
      ok: true,
      value: { channels: 0 },
    });
    expect(await methods.channelMarkAllRead({ channelId: 'grp-missing' })).toMatchObject({
      ok: false,
    });
    expect(await methods.channelMarkAllRead({ channelId: '../x' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.channelMarkAllRead({ botSlug: 'Not A Slug' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

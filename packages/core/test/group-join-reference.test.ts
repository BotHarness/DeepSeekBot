import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

async function sendSelectedGroup(
  core: ReturnType<typeof createCore>,
  botSlug: string,
  group: { id: string; name: string },
  messageId: string,
): Promise<void> {
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, botSlug, botSlug)!;
  const body = 'Please join #' + group.name;
  const start = body.indexOf('#');
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: messageId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
    channelRefs: [{ channelId: group.id, label: group.name, start, end: body.length }],
  });
  const admitted = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId: dm.id,
    messageId,
    body,
  });
  expect(admitted.admitted).toBe(true);
}

describe('selected #Group join request', () => {
  it('lets a Human approve and notifies the requester before its first Group send', async () => {
    const home = createTempRoot('botharness-group-join-human-');
    let groupId = '';
    let requestId = '';
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
        if (run.message.includes('[Selected Group Channel references:')) {
          expect(run.message).toContain('"joined":false');
          expect(run.message).not.toContain('"members"');
          expect(run.channels.list({ channelId: groupId }).channels).toEqual([]);
          expect(() => run.channels.query({ channelId: groupId })).toThrow();
          requestId = run.channels.requestGroupJoin!({ channelId: groupId }).id;
          expect(run.channels.list({ channelId: groupId }).channels).toEqual([]);
        } else if (run.message.includes('[Bot Inbox: Group join decision]')) {
          expect(run.message).toContain('accepted');
          await run.channels.send({ channelId: groupId, body: 'Joined and ready.' });
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      groupId = group.id;
      await sendSelectedGroup(core, 'ada', group, 'reference-human');
      await core.runtime.whenIdle();
      expect(requestId).toMatch(/^group-join-/u);
      expect(core.channels.get(group.id)?.members).toEqual([]);
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      const decision = methods.channelGroupJoinDecide({
        channelId: group.id,
        requestId,
        accept: true,
      });
      if (!decision.ok) throw new Error(decision.error.message);
      expect(decision).toMatchObject({ ok: true, value: { channel: { members: ['ada'] } } });
      await core.runtime.whenIdle();
      expect(runs.some((message) => message.includes('[Bot Inbox: Group join decision]'))).toBe(
        true,
      );
      expect(
        core.channels
          .readMessages(group.id)
          .some((message) => message.body === 'Joined and ready.'),
      ).toBe(true);
      expect(
        methods.channelGroupJoinDecide({ channelId: group.id, requestId, accept: true }),
      ).toMatchObject({ ok: true });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('lets the Bot creator approve from a durable Inbox notice', async () => {
    const home = createTempRoot('botharness-group-join-owner-');
    let groupId = '';
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
        if (run.bot.slug === 'ada' && run.message.includes('[Selected Group Channel references:')) {
          run.channels.requestGroupJoin!({ channelId: groupId });
        } else if (
          run.bot.slug === 'bea' &&
          run.message.includes('[Bot Inbox: Group join request]')
        ) {
          const request = run.channels.list({ channelId: groupId }).channels[0]
            ?.pendingJoinRequests?.[0];
          expect(request?.requesterBotId).toBe('ada');
          run.channels.decideGroupJoin!({
            channelId: groupId,
            requestId: request!.requestId,
            accept: true,
          });
        } else if (
          run.bot.slug === 'ada' &&
          run.message.includes('[Bot Inbox: Group join decision]')
        ) {
          await run.channels.send({ channelId: groupId, body: 'Hello team.' });
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['bea'],
        ownerBotSlug: 'bea',
      });
      groupId = group.id;
      await sendSelectedGroup(core, 'ada', group, 'reference-owner');
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)?.members).toEqual(['bea', 'ada']);
      expect(runs.some((message) => message.includes('[Bot Inbox: Group join request]'))).toBe(
        true,
      );
      expect(
        core.channels.readMessages(group.id).some((message) => message.body === 'Hello team.'),
      ).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('uses the selected ID across duplicate names and rename, and denial leaves access closed', async () => {
    const home = createTempRoot('botharness-group-join-deny-');
    let selectedId = '';
    let otherId = '';
    let requestId = '';
    let denied = false;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.message.includes('[Selected Group Channel references:')) {
          expect(run.message).toContain('"name":"Renamed"');
          expect(run.message).not.toContain('"members"');
          expect(() => run.channels.requestGroupJoin!({ channelId: otherId })).toThrow();
          const first = run.channels.requestGroupJoin!({ channelId: selectedId });
          const retry = run.channels.requestGroupJoin!({ channelId: selectedId });
          expect(retry.id).toBe(first.id);
          requestId = first.id;
          expect(() =>
            run.channels.decideGroupJoin!({
              channelId: selectedId,
              requestId,
              accept: true,
            }),
          ).toThrow();
        } else if (run.message.includes('[Bot Inbox: Group join decision]')) {
          denied = true;
          expect(run.message).toContain('declined');
          expect(() => run.channels.query({ channelId: selectedId })).toThrow();
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const other = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      const selected = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: [],
      });
      selectedId = selected.id;
      otherId = other.id;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'reference-duplicate',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '#Team',
        channelRefs: [{ channelId: selected.id, label: 'Team', start: 0, end: 5 }],
      });
      core.channels.rename(OWNER_HUMAN_CONTEXT, selected.id, 'Renamed');
      expect(
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: 'reference-duplicate',
          body: '#Team',
        }).admitted,
      ).toBe(true);
      await core.runtime.whenIdle();
      expect(core.channels.get(other.id)?.joinRequests).toBeUndefined();
      expect(core.channels.get(selected.id)?.joinRequests).toHaveLength(1);
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(
        methods.channelGroupJoinDecide({
          channelId: selected.id,
          requestId,
          accept: false,
        }),
      ).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(denied).toBe(true);
      expect(core.channels.get(selected.id)?.members).toEqual([]);
      expect(
        methods.channelGroupJoinDecide({
          channelId: selected.id,
          requestId,
          accept: true,
        }),
      ).toMatchObject({ ok: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('cancels a pending request when its PersonaBot is archived', async () => {
    const home = createTempRoot('botharness-group-join-archive-');
    let requestId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        requestId = run.channels.requestGroupJoin!({
          channelId: run.message.match(/"id":"(group-[^"]+)"/u)?.[1] ?? '',
        }).id;
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      await sendSelectedGroup(core, 'ada', group, 'reference-archive');
      await core.runtime.whenIdle();
      expect(requestId).toMatch(/^group-join-/u);
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(methods.pause({ slug: 'ada' })).toMatchObject({ ok: true });
      expect(core.channels.get(group.id)?.joinRequests?.[0]?.status).toBe('cancelled');
      expect(
        methods.channelGroupJoinDecide({
          channelId: group.id,
          requestId,
          accept: true,
        }),
      ).toMatchObject({ ok: false });
      expect(core.channels.get(group.id)?.members).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('cancels a pending request when its Group is deleted', async () => {
    const home = createTempRoot('botharness-group-join-delete-');
    let groupId = '';
    let requestId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.message.includes('[Selected Group Channel references:'))
          requestId = run.channels.requestGroupJoin!({ channelId: groupId }).id;
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      groupId = group.id;
      await sendSelectedGroup(core, 'ada', group, 'reference-delete');
      await core.runtime.whenIdle();
      expect(requestId).toMatch(/^group-join-/u);
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      expect(methods.channelGroupDelete({ channelId: groupId })).toMatchObject({ ok: true });
      expect(core.channels.get(groupId)).toBeUndefined();
      expect(
        methods.channelGroupJoinDecide({ channelId: groupId, requestId, accept: true }),
      ).toMatchObject({ ok: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('settles an undelivered decision notice when the requester is paused', async () => {
    const home = createTempRoot('botharness-group-join-decision-pause-');
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.message.includes('[Selected Group Channel references:'))
          run.channels.requestGroupJoin!({ channelId: groupId });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      groupId = group.id;
      await sendSelectedGroup(core, 'ada', group, 'reference-decision-pause');
      await core.runtime.whenIdle();
      const request = core.channels.get(groupId)?.joinRequests?.[0];
      expect(request?.status).toBe('pending');
      const requester = core.registry.get('ada')!;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      core.channels.decideGroupJoin({
        channelId: groupId,
        requestId: request!.id,
        accept: false,
        decidedBy: 'human',
        requesterBotCreatedAt: requester.createdAt,
        requesterDmChannelId: dm.id,
      });
      const database = new DatabaseSync(core.operationalDatabase.databasePath);
      try {
        const state = () =>
          (
            database
              .prepare(`
          SELECT attempt_state FROM inbox_admissions
          WHERE bot_slug = 'ada' AND reason = 'group-join-decision'
        `)
              .get() as { attempt_state: string } | undefined
          )?.attempt_state;
        expect(state()).toBe('pending');
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
        expect(methods.pause({ slug: 'ada' })).toMatchObject({ ok: true });
        expect(state()).toBe('handled');
        expect(
          methods.channelGroupJoinDecide({
            channelId: groupId,
            requestId: request!.id,
            accept: false,
          }),
        ).toMatchObject({ ok: true });
      } finally {
        database.close();
      }
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps one pending request across restart and delivers an approval only once', async () => {
    const home = createTempRoot('botharness-group-join-restart-');
    let groupId = '';
    let requestId = '';
    const before = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        requestId = run.channels.requestGroupJoin!({ channelId: groupId }).id;
      }),
    });
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = before.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
      groupId = group.id;
      await sendSelectedGroup(before, 'ada', group, 'reference-restart');
      await before.runtime.whenIdle();
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }
    let decisions = 0;
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.message.includes('[Bot Inbox: Group join decision]')) decisions += 1;
      }),
    });
    try {
      expect(resumed.channels.get(groupId)?.joinRequests?.[0]?.id).toBe(requestId);
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...resumed });
      expect(
        methods.channelGroupJoinDecide({ channelId: groupId, requestId, accept: true }),
      ).toMatchObject({ ok: true });
      await resumed.runtime.whenIdle();
      expect(decisions).toBe(1);
      expect(
        methods.channelGroupJoinDecide({ channelId: groupId, requestId, accept: true }),
      ).toMatchObject({ ok: true });
      await resumed.runtime.whenIdle();
      expect(decisions).toBe(1);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});

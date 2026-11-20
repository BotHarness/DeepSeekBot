import { maskedApprovalCardSchema } from '../src/team/approvals.js';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createChannelLiveHub } from '../src/channels/live.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createFakeRosterDomain } from './roster-fixture.js';
import { activityListPushSource } from '../src/push/source.js';
import {
  alice,
  bob,
  admin,
  fixture,
  seed,
  masked,
  humanProjections,
  cleanup,
} from './team-approvals-fixtures.js';

afterEach(cleanup);

describe('M5 approval projections and decisions', () => {
  it.each(['tool', 'question', 'secret'] as const)(
    'never matches hidden %s content in any Human search',
    async (kind) => {
      const f = fixture();
      await f.roster.attach(createFakeRosterDomain().facility);
      const request = await seed(f, kind);
      for (const text of ['CONFIDENTIAL', 'CONFIDENTIAL_TOOL', 'CONFIDENTIAL_QUESTION', 'CO']) {
        expect(await f.invoke(bob, 'channelSearch', { channelId: f.group.id, text })).toMatchObject(
          { messages: [] },
        );
        expect(await f.invoke(bob, 'messageSearch', { text })).toMatchObject({ hits: [] });
        for (const category of ['action', 'unread', 'replies', 'handled'] as const)
          expect(f.attention.list(bob, { category, search: text }).items).toEqual([]);
      }
      for (const method of ['channelSearch', 'messageSearch'])
        masked(
          await f.invoke(bob, method, {
            ...(method === 'channelSearch' ? { channelId: f.group.id } : {}),
            text: 'alice-bot',
          }),
          request.id,
        );
      masked(f.attention.list(bob, { category: 'action', search: 'alice-bot' }), request.id);
      expect(f.attention.list(bob, { category: 'action', search: 'Team' }).items).toEqual([]);
      f.database.transaction((db) =>
        db
          .prepare(
            `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) VALUES (?, 'admin', 'Admin', 0, ?)`,
          )
          .run(f.group.id, new Date().toISOString()),
      );
      expect(
        await f.invoke(admin, 'channelSearch', { channelId: f.group.id, text: 'CONFIDENTIAL' }),
      ).toMatchObject({ messages: [{ id: request.id }] });
      expect(await f.invoke(admin, 'messageSearch', { text: 'CONFIDENTIAL' })).toMatchObject({
        hits: [{ message: { id: request.id } }],
      });
      expect(
        f.attention.list(admin, { category: 'action', search: 'CONFIDENTIAL' }).items,
      ).toHaveLength(1);
    },
  );

  it.each(['tool', 'question', 'secret'] as const)(
    'removes reply previews of masked %s cards but keeps visible and ordinary previews',
    async (kind) => {
      const f = fixture();
      const request = await seed(f, kind);
      const reply: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Public reply',
        replyTo: request.id,
      };
      await f.channels.appendMessage(bob, f.group.id, reply);
      f.database.transaction((db) =>
        db
          .prepare(
            `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) VALUES (?, 'admin', 'Admin', 0, ?)`,
          )
          .run(f.group.id, reply.at),
      );
      const canonical = f.channels.message(f.group.id, reply.id)!;
      expect(canonical.replyToPreview?.body).toContain('CONFIDENTIAL');
      expect(f.team.approvals.project(bob, canonical, f.group.id).replyToPreview).toBeNull();
      expect(f.team.approvals.project(admin, canonical, f.group.id).replyToPreview?.body).toContain(
        'CONFIDENTIAL',
      );
      const ordinary: ChannelMessage = {
        id: randomUUID(),
        at: reply.at,
        author: { kind: 'human' },
        body: 'Ordinary',
        replyTo: reply.id,
      };
      await f.channels.appendMessage(bob, f.group.id, ordinary);
      expect(
        f.team.approvals.project(bob, f.channels.message(f.group.id, ordinary.id), f.group.id)
          ?.replyToPreview?.body,
      ).toBe('Public reply');
      for (const method of ['channelMessages', 'channelTimeline', 'channelJournalPage']) {
        const wire = JSON.stringify(
          await f.invoke(bob, method, {
            channelId: f.group.id,
            ...(method === 'channelJournalPage'
              ? { through: f.channels.revision(f.group.id) }
              : {}),
          }),
        );
        expect(wire).not.toContain('CONFIDENTIAL');
      }
    },
  );

  it.each(['missing', 'purged'] as const)(
    'fails closed for buffered cards and resolutions with %s canonical requests',
    async (state) => {
      const f = fixture();
      const request = await seed(f, 'question');
      const live = createChannelLiveHub(
        f.channels,
        undefined,
        undefined,
        undefined,
        (human) => f.team.isOwner(human),
        undefined,
        (human, id) => f.team.channelAccess.canRead(human, id, true),
        undefined,
        (human, value, channelId) => f.team.approvals.project(human, value, channelId),
      );
      const controller = new AbortController();
      const frames = live
        .followChannel(bob, f.group.id, 20, controller.signal)
        [Symbol.asyncIterator]();
      try {
        await frames.next();
        live.publishAdmission(f.group.id, request.id, request);
        const read = f.channels.message.bind(f.channels);
        const spy = vi.spyOn(f.channels, 'message').mockImplementation((channelId, id) =>
          id === request.id
            ? state === 'missing'
              ? undefined
              : {
                  id,
                  at: request.at,
                  author: request.author,
                  body: '',
                  contentPurge: { at: request.at },
                }
            : read(channelId, id),
        );
        for (const human of [bob, owner]) {
          const decision = {
            id: 'decision',
            at: request.at,
            author: { kind: 'human' as const },
            body: 'CONFIDENTIAL_ANSWER',
            replyTo: request.id,
            userQuestionResolution: {
              requestMessageId: request.id,
              state: 'answered' as const,
              answers: [{ id: 'q', selected: ['CONFIDENTIAL_ANSWER'] }],
            },
          };
          const wire = JSON.stringify(
            f.team.approvals.project(
              human,
              [{ ...request, approval: { private: 'CONFIDENTIAL_STALE' } }, decision],
              f.group.id,
            ),
          );
          expect(wire).not.toContain('CONFIDENTIAL');
          expect(wire).not.toContain('userQuestionRequest');
          expect(wire).not.toContain('userQuestionResolution');
        }
        const frame = JSON.stringify((await frames.next()).value);
        expect(frame).not.toContain('CONFIDENTIAL');
        spy.mockRestore();
      } finally {
        controller.abort();
        await frames.return?.();
        live.close();
      }
    },
  );

  it('routes only the masked request to an unattended Bot owner outside a Human DM audience', async () => {
    const f = fixture();
    f.team.roles.set(owner, admin.humanId, ['member']);
    const dm = f.team.channelAccess.dm(bob, admin.humanId).channel;
    const request = await seed(f, 'question', 'alice-bot', dm.id);
    masked(f.attention.list(alice, { category: 'action' }), request.id);
    masked(activityListPushSource(f.attention, () => undefined).pending(alice), request.id);
    expect(() => f.team.approvals.requireRequest(alice, dm.id, request.id)).toThrow(
      'approval-not-allowed',
    );
    await expect(f.invoke(alice, 'channelMessages', { channelId: dm.id })).rejects.toMatchObject({
      code: expect.stringMatching(/channel-not-found|remote-access\/denied/),
    });
    expect(f.attention.list(alice, { category: 'action', search: 'CONFIDENTIAL' }).items).toEqual(
      [],
    );
  });

  it('repairs historical Human authors from canonical Source Event identity and preserves deleted authors', async () => {
    const f = fixture();
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Historical answer',
    };
    await f.channels.appendMessage(bob, f.group.id, message);
    f.database.transaction((db) =>
      db
        .prepare(`UPDATE source_events SET payload_json = json_remove(payload_json,
      '$.author.humanId', '$.author.displayName') WHERE message_id = ?`)
        .run(message.id),
    );
    await humanProjections(f, message, bob);
    const historical = f.channels.message(f.group.id, message.id);
    if (!historical) throw new Error('Missing historical message');
    const before = f.db.diagnostics().metrics.reads;
    f.team.approvals.project(
      bob,
      Array.from({ length: 200 }, () => historical),
      f.group.id,
    );
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
    const replyId = randomUUID();
    await f.channels.appendMessage(owner, f.group.id, {
      id: replyId,
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'alice-bot' },
      replyTo: message.id,
      body: 'Historical reply',
    });
    const reply = f.team.approvals.project(
      bob,
      f.channels.message(f.group.id, replyId),
      f.group.id,
    );
    expect(reply?.replyToPreview?.author).toEqual({
      kind: 'human',
      humanId: bob.humanId,
      displayName: 'bob',
    });
    const tombstone = { kind: 'human', humanId: 'deleted-human', deleted: true } as const;
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE source_events SET payload_json = json_set(payload_json, '$.author', json(?)) WHERE message_id = ?",
        )
        .run(JSON.stringify(tombstone), message.id),
    );
    expect(
      f.team.approvals.project(bob, f.channels.message(f.group.id, message.id), f.group.id)?.author,
    ).toEqual(tombstone);
  });

  it('uses the authenticated Human instead of supplied author fields and keeps retries stable after renaming', async () => {
    const f = fixture();
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: owner.humanId, displayName: 'Forged Owner' },
      body: 'Generated Human message',
    };
    const result = await f.channels.appendMessageOnce(bob, f.group.id, message);
    expect(result.status === 'appended' && result.message.author).toEqual({
      kind: 'human',
      humanId: bob.humanId,
      displayName: 'bob',
    });
    f.channels.setHumanDefaultName(bob, 'Bob renamed');
    expect((await f.channels.appendMessageOnce(bob, f.group.id, message)).status).toBe('existing');
    f.team.channelAccess.addMember(bob, f.group.id, alice.humanId);
    expect((await f.channels.appendMessageOnce(alice, f.group.id, message)).status).toBe(
      'conflict',
    );
    expect(
      f.database.read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE message_id = ?').get(message.id),
      )?.human_id,
    ).toBe(bob.humanId);
  });

  it.each(['ordinary', 'tool', 'question', 'secret'] as const)(
    'names a private participant through every %s message projection without exposing its profile',
    async (kind) => {
      const f = fixture();
      await f.roster.attach(createFakeRosterDomain().facility);
      f.registry.update('alice-bot', { displayName: 'Planner', description: 'PRIVATE_PERSONA' });
      f.database.transaction((db) =>
        db
          .prepare(`UPDATE persona_bots SET body = json_set(body,
        '$.memoryDir', 'PRIVATE_MEMORY', '$.promptPreset', 'PRIVATE_PROMPT',
        '$.approvalTemplate', 'PRIVATE_SETTINGS') WHERE slug = 'alice-bot'`)
          .run(),
      );
      expect(await f.invoke(bob, 'list', {})).not.toMatchObject({
        bots: expect.arrayContaining([expect.objectContaining({ slug: 'alice-bot' })]),
      });
      const request =
        kind === 'ordinary'
          ? {
              id: randomUUID(),
              at: new Date().toISOString(),
              author: { kind: 'bot' as const, slug: 'alice-bot' },
              body: 'participant-message',
            }
          : await seed(f, kind);
      if (kind === 'ordinary') await f.channels.appendMessage(owner, f.group.id, request);
      const input = { channelId: f.group.id };
      const author = { kind: 'bot', slug: 'alice-bot', displayName: 'Planner' };
      const check = (value: unknown) => {
        const wire = JSON.stringify(value);
        expect(wire).toContain('"displayName":"Planner"');
        for (const secret of [
          'PRIVATE_PERSONA',
          'PRIVATE_MEMORY',
          'PRIVATE_PROMPT',
          'PRIVATE_SETTINGS',
        ])
          expect(wire).not.toContain(secret);
        if (kind !== 'ordinary') masked(value);
      };
      for (const [method, args] of [
        ['channels', {}],
        ['channelMessages', input],
        ['channelTimeline', input],
        ['channelJournalPage', { ...input, through: 1 }],
        [
          'channelSearch',
          { ...input, text: kind === 'ordinary' ? 'participant-message' : 'alice-bot' },
        ],
        ['messageSearch', { text: kind === 'ordinary' ? 'participant-message' : 'alice-bot' }],
      ] as const)
        check(await f.invoke(bob, method, args));
      const projected = f.team.approvals.project(bob, request, f.group.id);
      expect(projected.author).toEqual(author);
      expect(
        f.team.approvals.project(
          bob,
          {
            ...request,
            author: { ...request.author, settings: 'PRIVATE_SETTINGS' },
          },
          f.group.id,
        ).author,
      ).toEqual(author);
      expect(f.channels.message(f.group.id, request.id)?.author).toEqual({
        kind: 'bot',
        slug: 'alice-bot',
      });
      const activity = f.attention.list(bob, {
        category: kind === 'ordinary' ? 'unread' : 'action',
      });
      check(activity);
      expect(activity.items[0]?.author).toEqual(author);
      if (kind !== 'ordinary') {
        const push = activityListPushSource(f.attention, () => undefined).pending(bob);
        check(push);
        expect(push.items[0]?.author).toEqual(author);
      }
      await f.team.asMember('bob', async (peer) => {
        const controller = new AbortController();
        const iterator = (
          await f.gateway.stream({
            namespace: 'botharness',
            method: 'followChannel',
            args: input,
            peer,
            signal: controller.signal,
          })
        )[Symbol.asyncIterator]();
        try {
          check((await iterator.next()).value);
        } finally {
          controller.abort();
          await iterator.return?.();
        }
      });
      const live = createChannelLiveHub(
        f.channels,
        undefined,
        undefined,
        undefined,
        (human) => f.team.isOwner(human),
        undefined,
        (human, id) => f.team.channelAccess.canRead(human, id, true),
        (human, id) => f.team.channelAccess.canKnow(human, id),
        (human, value, channelId) => f.team.approvals.project(human, value, channelId),
      );
      const controller = new AbortController();
      const frames = live
        .followChannel(bob, f.group.id, 20, controller.signal)
        [Symbol.asyncIterator]();
      try {
        check((await frames.next()).value);
      } finally {
        controller.abort();
        await frames.return?.();
        live.close();
      }
      f.registry.update('alice-bot', { displayName: 'Planner renamed' });
      expect(f.team.approvals.project(bob, request, f.group.id).author).toEqual({
        ...author,
        displayName: 'Planner renamed',
      });
    },
  );

  it('names a private Bot reply in Activity and push without exposing its profile', async () => {
    const f = fixture();
    f.registry.update('alice-bot', { displayName: 'Planner', description: 'PRIVATE_PERSONA' });
    const questionId = randomUUID();
    await f.channels.appendMessage(bob, f.group.id, {
      id: questionId,
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Question',
    });
    const messageId = randomUUID();
    await f.channels.appendMessage(owner, f.group.id, {
      id: messageId,
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'alice-bot' },
      replyTo: questionId,
      body: 'Reply',
    });
    const author = { kind: 'bot', slug: 'alice-bot', displayName: 'Planner' };
    const activity = f.attention.list(bob, { category: 'replies' });
    expect(activity.items).toContainEqual(expect.objectContaining({ messageId, author }));
    const push = activityListPushSource(f.attention, () => undefined).pending(bob);
    expect(push.items).toContainEqual(expect.objectContaining({ messageId, author }));
    expect(JSON.stringify([activity, push])).not.toContain('PRIVATE_PERSONA');
  });

  it.each(['tool', 'question', 'secret'] as const)(
    'masks %s cards through every projection without mutating canonical content',
    async (kind) => {
      const f = fixture();
      const message = await seed(f, kind);
      const input = { channelId: f.group.id, messageId: message.id };
      const projections = [
        () => f.invoke(bob, 'channels', {}),
        () => f.invoke(bob, 'channelMessages', { channelId: f.group.id }),
        () => f.invoke(bob, 'channelTimeline', { channelId: f.group.id }),
        () => f.invoke(bob, 'channelJournalPage', { channelId: f.group.id, through: 1 }),
        () => f.invoke(bob, 'channelSearch', { channelId: f.group.id, text: 'alice-bot' }),
        () =>
          f.invoke(
            bob,
            kind === 'tool'
              ? 'toolApprovalStatus'
              : kind === 'question'
                ? 'userQuestionStatus'
                : 'privateInputStatus',
            input,
          ),
        () => f.invoke(bob, 'humanAttention', { category: 'action' }),
        () => f.attention.list(bob, { category: 'action' }),
        () =>
          activityListPushSource(
            f.attention,
            (slug) => slug,
            (channel, id) => f.channels.message(channel, id)?.toolApprovalRequest,
          ).pending(bob),
      ];
      for (const read of projections) masked(await read());
      await f.team.asMember('bob', async (peer) => {
        const controller = new AbortController();
        const iterator = (
          await f.gateway.stream({
            namespace: 'botharness',
            method: 'followChannel',
            args: { channelId: f.group.id, limit: 20 },
            peer,
            signal: controller.signal,
          })
        )[Symbol.asyncIterator]();
        try {
          masked((await iterator.next()).value, message.id);
        } finally {
          controller.abort();
          await iterator.return?.();
        }
      });
      const canonical = f.channels.message(f.group.id, message.id)!;
      const projected = f.team.approvals.project(bob, canonical, f.group.id);
      const wire = await f.invoke(bob, 'channelMessages', { channelId: f.group.id });
      const field =
        kind === 'tool'
          ? 'toolApprovalRequest'
          : kind === 'question'
            ? 'userQuestionRequest'
            : 'privateInputRequest';
      const expectedKind =
        kind === 'tool' ? 'tool-approval' : kind === 'question' ? 'user-question' : 'private-input';
      expect(maskedApprovalCardSchema.safeParse(projected[field]).success).toBe(true);
      expect(wire).toMatchObject({
        messages: [
          {
            [field]: {
              masked: true,
              kind: expectedKind,
              botSlug: 'alice-bot',
              state: 'pending',
              requestedAt: message.at,
            },
          },
        ],
      });
      const raw = f.channels.message(f.group.id, message.id);
      expect(JSON.stringify(raw)).toContain('CONFIDENTIAL');
      expect(raw?.approval).toBeUndefined();
      if (kind === 'tool') {
        await expect(
          f.invoke(bob, 'toolApprovalDecide', { ...input, outcome: 'allowed-once' }),
        ).rejects.toMatchObject({ code: 'approval-not-allowed' });
        await expect(
          f.invoke(alice, 'toolApprovalDecide', { ...input, outcome: 'allowed-once' }),
        ).rejects.toMatchObject({
          code: 'permission-required',
          details: { permission: 'approvals.opaqueTools' },
        });
      } else if (kind === 'question') {
        await expect(
          f.invoke(bob, 'userQuestionAnswer', { ...input, answer: { answers: [] } }),
        ).rejects.toMatchObject({ code: 'approval-not-allowed' });
      } else {
        for (const method of ['privateInputSubmit', 'privateInputCancel'])
          await expect(
            f.invoke(bob, method, {
              ...input,
              ...(method === 'privateInputSubmit' ? { values: {} } : {}),
            }),
          ).rejects.toMatchObject({ code: 'approval-not-allowed' });
      }
    },
  );

  it.each(['tool', 'question', 'secret'] as const)(
    'preserves role-restricted access around %s approval projections',
    async (kind) => {
      const f = fixture();
      f.database.transaction((db) =>
        db
          .prepare('DELETE FROM channel_human_members WHERE channel_id = ? AND human_id = ?')
          .run(f.group.id, alice.humanId),
      );
      f.team.channelAccess.visibilitySet(bob, f.group.id, { kind: 'roles', roleIds: ['member'] });
      const request = await seed(f, kind);
      const project = vi.spyOn(f.team.approvals, 'project');
      expect(await f.invoke(bob, 'channelGet', { channelId: f.group.id })).toMatchObject({
        role: 'owner',
        visibility: { kind: 'roles' },
      });
      expect(project).toHaveBeenCalled();
      masked(await f.invoke(bob, 'channelMessages', { channelId: f.group.id }), request.id);
      if (kind !== 'tool') {
        expect(f.team.approvals.card(alice, f.group.id, request)).toMatchObject({ masked: false });
        expect(() => f.team.approvals.requireRequest(alice, f.group.id, request.id)).not.toThrow();
      }
      const { role } = f.team.roles.create(owner, 'Outside Channel', []);
      f.team.roles.set(owner, alice.humanId, [role.roleId]);
      await f.team.accessSettled();
      expect(f.methods(alice).channelMessages({ channelId: f.group.id })).toMatchObject({
        ok: false,
        error: { code: 'channel-not-found' },
      });
      expect(() => f.team.approvals.requireRequest(alice, f.group.id, request.id)).toThrow(
        'approval-not-allowed',
      );
      expect(f.attention.list(alice, { category: 'action' }).items).toEqual([]);
      expect(f.attention.list(admin, { category: 'action' }).items).toHaveLength(0);
    },
  );

  it('does not leak opaque tool details through an owned Bot Activity snapshot', () => {
    const f = fixture();
    const activity = {
      effect: 'executing',
      toolKind: 'command',
      toolName: 'CONFIDENTIAL_TOOL',
      publicDetail: 'CONFIDENTIAL_INPUT',
      detailRefs: ['private-reference'],
      activeToolCount: 1,
      startedAt: Date.now(),
    };
    const snapshot = {
      bots: [
        { slug: 'alice-bot', state: 'working', activity, sessions: [{ id: 'session', activity }] },
      ],
    };
    const wire = JSON.stringify(f.team.approvals.project(alice, snapshot));
    expect(wire).not.toContain('CONFIDENTIAL');
    expect(wire).not.toContain('private-reference');
    expect(wire).toContain('executing');
  });

  it('projects current pending, expired and stopped states without retaining a stale status provider', async () => {
    const f = fixture();
    const request = await seed(f, 'tool');
    let state = 'pending';
    const off = f.team.approvals.bindStatus(() => state);
    for (state of ['pending', 'expired', 'stopped'])
      expect(f.team.approvals.card(bob, f.group.id, request)).toMatchObject({
        masked: true,
        state,
      });
    off();
    expect(f.team.approvals.card(bob, f.group.id, request)).toMatchObject({ state: 'pending' });
  });

  it('records the Human decider and masks resolved question answers on replay', async () => {
    const f = fixture();
    const request = await seed(f, 'question');
    await f.channels.appendMessage(alice, f.group.id, {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'CONFIDENTIAL_QUESTION',
      replyTo: request.id,
      userQuestionResolution: {
        requestMessageId: request.id,
        state: 'answered',
        answers: [{ id: 'q', selected: [], custom: 'CONFIDENTIAL_QUESTION' }],
        decidedBy: { humanId: 'alice', displayName: 'Alice' },
      },
    });
    const page = await f.invoke(bob, 'channelMessages', { channelId: f.group.id });
    masked(page, request.id);
    const visible = f.team.approvals.card(alice, f.group.id, request);
    expect(visible).toMatchObject({
      masked: false,
      state: 'answered',
      opaque: false,
      decidedBy: { humanId: 'alice', displayName: 'Alice' },
    });
  });

  it('bounds author lookups per Bot and approval lookups per request within a projection', async () => {
    const f = fixture();
    const request = await seed(f, 'question');
    const ordinary = Array.from({ length: 200 }, (_, index) => ({
      id: 'plain-' + index,
      at: request.at,
      author: request.author,
      body: 'ordinary',
    }));
    const scan = vi.spyOn(f.channels, 'readMessages');
    expect(f.userQuestions.status('alice-bot', request.id, f.group.id, false)).toBe('expired');
    expect(scan).not.toHaveBeenCalled();
    const before = f.db.diagnostics().metrics.reads;
    f.team.approvals.project(bob, ordinary, f.group.id);
    const authorReads = f.db.diagnostics().metrics.reads - before;
    expect(authorReads).toBe(1);
    const humanStart = f.db.diagnostics().metrics.reads;
    f.team.approvals.project(
      bob,
      ordinary.map((message) => ({
        ...message,
        author: { kind: 'human', humanId: bob.humanId, displayName: 'bob' },
      })),
      f.group.id,
    );
    expect(f.db.diagnostics().metrics.reads - humanStart).toBe(0);
    const start = f.db.diagnostics().metrics.reads;
    f.team.approvals.project(
      bob,
      Array.from({ length: 200 }, () => request),
      f.group.id,
    );
    expect(f.db.diagnostics().metrics.reads - start).toBeLessThanOrEqual(9 + authorReads);
  });
});

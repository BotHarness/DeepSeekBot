import { maskedApprovalCardSchema } from '../src/team/approvals.js';
import { createPushDelivery, type ExpoMessage } from '../src/push/delivery.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { Context, Service } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamService } from '../src/team/service.js';
import { memberPolicy } from '../src/team/policy.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createChannelLiveHub } from '../src/channels/live.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createFakeRosterDomain, createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { activityListPushSource } from '../src/push/source.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createAssignmentAccessStore } from '../src/workspaces/assignment-access.js';
import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  orchestratorPermission,
  sessionHasFullAccess,
} from '../src/workspaces/grant-execution.js';
import { SandboxPolicyService, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { ApprovalService, setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';

const alice = humanContext('alice');
const bob = humanContext('bob');
const admin = humanContext('admin');
const closes: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function fixture() {
  const root = createTempRoot('team-m5-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(root, 'channels') });
  const team = new TeamService(database, channels);
  database.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled = 1').run();
    for (const human of [alice, bob, admin]) {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
        human.humanId,
        human.humanId,
        new Date().toISOString(),
      );
      db.prepare('INSERT INTO human_roles VALUES (?, ?)').run(
        human.humanId,
        human === admin ? 'admin' : 'member',
      );
      db.prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 0)').run(
        human.humanId,
        human.humanId,
        JSON.stringify(DUMMY_PASSWORD_HASH),
        '[]',
      );
    }
  });
  for (const human of [alice, owner]) {
    const slug = human === owner ? 'owner-bot' : 'alice-bot';
    registry.create({ slug, displayName: slug, ownerHumanId: human.humanId });
    channels.getOrCreateDm(human, slug);
  }
  const group = channels.createGroup(bob, { name: 'Team', members: ['alice-bot', 'owner-bot'] });
  const active: string[] = [];
  const attention = createHumanAttentionQuery(
    database,
    () => active,
    () => active,
    () => active,
    () => [],
    () => new Date(),
    (human, value) => team.approvals.project(human, value),
  );
  const assignmentAccess = createAssignmentAccessStore(database);
  const ownership = createTestOwnership();
  const toolApproval = new ChannelToolApproval(
    channels,
    ownership,
    undefined,
    undefined,
    undefined,
    undefined,
    () => group.id,
    undefined,
    undefined,
    team.approvals,
  );
  const userQuestions = new ChannelUserQuestions(
    channels,
    ownership,
    undefined,
    undefined,
    undefined,
    undefined,
    () => group.id,
    team.approvals,
  );
  const roster = createTestRosterStore({ database: db });
  const methods = createBridgeMethodsForHumans({
    registry,
    channels,
    team,
    ownership,
    toolApproval,
    userQuestions,
    humanAttention: attention,
    assignmentAccess,
    states: createBotStateTracker(),
    roster,
  });
  const ctx = new Context();
  const off = team.bindRuntime({
    createPeer: (principal) => new Peer(ctx, { principal }),
    invalidate() {},
    urls: () => [],
  });
  registerBridge(
    ctx,
    methods,
    undefined,
    {
      async *followRoster() {},
      async *followActivity() {},
      async *followCompanion() {},
      async *followChannel(human, channelId) {
        for (const [index, message] of channels.readMessages(channelId).entries())
          yield { type: 'entry', entry: { channelId, message, revision: index + 1 } };
      },
      journalPage: (human, channelId, request) =>
        channels.readHumanJournalPage(human, channelId, request),
      filesPage: (human, channelId, request) =>
        channels.readHumanFilesPage(human, channelId, request),
      changes: (human, channelId, request) =>
        channels.readHumanChanges?.(human, channelId, request),
      changeCursor: () => channels.changeCursor?.(),
    },
    team,
  );
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [], get: () => undefined },
    resources: { entries: () => [] },
  });
  const access = new RemoteAccessService(ctx);
  access.registerPolicy('botharness-member', memberPolicy(team));
  const gateway = new TypertGatewayService(ctx, {});
  const invoke = (human: typeof alice, method: string, args: Record<string, unknown>) =>
    human === owner
      ? gateway.invoke({
          namespace: 'botharness',
          method,
          args,
          peer: new Peer(ctx, { principal: { kind: 'owner' } }),
        })
      : team.asMember(human.humanId, (peer) =>
          gateway.invoke({ namespace: 'botharness', method, args, peer }),
        );
  closes.push(async () => {
    toolApproval.close();
    userQuestions.close();
    await off();
    await ctx.fiber.dispose();
  });
  return {
    registry,
    gateway,
    database,
    db,
    channels,
    roster,
    team,
    group,
    attention,
    active,
    assignmentAccess,
    ownership,
    methods,
    invoke,
    toolApproval,
    userQuestions,
    ctx,
  };
}

const secrets = [
  'CONFIDENTIAL_TOOL',
  'CONFIDENTIAL_INPUT',
  'CONFIDENTIAL_QUESTION',
  'CONFIDENTIAL_PROMPT',
];
async function seed(
  f: ReturnType<typeof fixture>,
  kind: 'tool' | 'question' | 'secret',
  slug = 'alice-bot',
  channelId = f.group.id,
) {
  const message: ChannelMessage = {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bot', slug },
    body: secrets.join(' '),
    ...(kind === 'tool'
      ? ({
          toolApprovalRequest: {
            sessionId: 'session',
            callId: 'call',
            toolName: 'bash',
            role: 'orchestrator',
            cwd: '/',
            input: 'CONFIDENTIAL_INPUT',
          },
        } satisfies Pick<ChannelMessage, 'toolApprovalRequest'>)
      : kind === 'question'
        ? {
            userQuestionRequest: {
              sessionId: 'session',
              questions: [{ id: 'q', question: 'CONFIDENTIAL_QUESTION' }],
            },
          }
        : {
            privateInputRequest: {
              sessionId: 'session',
              account: 'account',
              purpose: 'CONFIDENTIAL_PROMPT',
              fields: [{ id: 'key', label: 'CONFIDENTIAL_PROMPT', required: true }],
            },
          }),
  };
  await f.channels.appendMessage(owner, channelId, message);
  f.active.push(message.id);
  return message;
}
function masked(value: unknown, id?: string) {
  const wire = JSON.stringify(value);
  for (const secret of secrets) expect(wire).not.toContain(secret);
  expect(wire).not.toContain('"toolName"');
  expect(wire).toContain('"masked":true');
  if (id) expect(wire).toContain(id);
}

async function humanProjections(
  f: ReturnType<typeof fixture>,
  message: ChannelMessage,
  human = alice,
) {
  await f.roster.attach(createFakeRosterDomain().facility);
  const author = {
    kind: 'human',
    humanId: human.humanId,
    displayName: f.team.mode(human).viewer.displayName,
  };
  const check = (value: unknown) => {
    let found = false;
    const visit = (entry: unknown) => {
      if (entry === null || typeof entry !== 'object') return;
      if ('id' in entry && entry.id === message.id && 'author' in entry) {
        expect(entry.author).toEqual(author);
        found = true;
      }
      for (const item of Object.values(entry)) visit(item);
    };
    visit(value);
    expect(found).toBe(true);
  };
  const input = { channelId: f.group.id };
  for (const [method, args] of [
    ['channelMessages', input],
    ['channelTimeline', input],
    ['channels', {}],
    ['channelJournalPage', { ...input, through: f.channels.revision(f.group.id) }],
    ['channelSearch', { ...input, text: message.body }],
    ['messageSearch', { text: message.body }],
  ] as const)
    check(await f.invoke(bob, method, args));
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
    let found = false;
    try {
      for (let i = 0; i < f.channels.readMessages(f.group.id).length; i++) {
        const frame = (await iterator.next()).value;
        if (JSON.stringify(frame).includes(message.id)) {
          check(frame);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    } finally {
      controller.abort();
      await iterator.return?.();
    }
  });
}

describe('M5 approval projections and decisions', () => {
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
          { ...input, text: kind === 'ordinary' ? 'participant-message' : 'CONFIDENTIAL' },
        ],
        ['messageSearch', { text: kind === 'ordinary' ? 'participant-message' : 'CONFIDENTIAL' }],
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
        () => f.invoke(bob, 'channelSearch', { channelId: f.group.id, text: 'CONFIDENTIAL' }),
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
    'retains M4 Human DM access and masks %s cards',
    async (kind) => {
      const f = fixture();
      const dm = f.team.channelAccess.dm(alice, bob.humanId).channel;
      const request = await seed(f, kind, 'alice-bot', dm.id);
      const project = vi.spyOn(f.team.approvals, 'project');
      expect(await f.invoke(bob, 'channelGet', { channelId: dm.id })).toMatchObject({
        channel: { id: dm.id },
      });
      expect(project).toHaveBeenCalled();
      for (const method of ['channelMessages', 'channelTimeline'])
        masked(await f.invoke(bob, method, { channelId: dm.id }), request.id);
      const method =
        kind === 'tool'
          ? 'toolApprovalStatus'
          : kind === 'question'
            ? 'userQuestionStatus'
            : 'privateInputStatus';
      masked(await f.invoke(bob, method, { channelId: dm.id, messageId: request.id }));
      masked(f.attention.list(bob, { category: 'action' }), request.id);
      for (const outsider of [owner, admin])
        await expect(
          f.invoke(outsider, 'channelMessages', { channelId: dm.id }),
        ).rejects.toMatchObject({
          code: expect.stringMatching(/channel-not-found|remote-access\/denied/),
        });
      if (kind !== 'tool')
        expect(f.team.approvals.card(alice, dm.id, request)).toMatchObject({ masked: false });
    },
  );

  it.each(['tool', 'question', 'secret'] as const)(
    'preserves role-restricted access around %s approval projections',
    async (kind) => {
      const f = fixture();
      f.team.channelAccess.addMember(bob, f.group.id, alice.humanId);
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
      expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(0);
      expect(f.attention.list(admin, { category: 'action' }).items).toHaveLength(0);
    },
  );

  it('sends only masked push payloads and deduplicates delivery', async () => {
    const f = fixture();
    const pairing = createDevicePairing({ database: f.database, hostName: 'M5' });
    const sent: ExpoMessage[] = [];
    const delivery = createPushDelivery({
      database: f.database,
      source: activityListPushSource(
        f.attention,
        (slug) => slug,
        (channel, id) => f.channels.message(channel, id)?.toolApprovalRequest,
      ),
      sender: {
        async send(messages) {
          sent.push(...messages);
          return messages.map((_, i) => ({ status: 'ok' as const, id: 'ticket-' + i }));
        },
        async receipts() {
          return {};
        },
      },
      host: () => pairing.host(),
      deviceActive: () => true,
      deviceHuman: (id) => (id === 'missing' ? undefined : bob),
    });
    const paired = pairing.redeem({ offer: pairing.createOffer().offer, name: 'Bob' });
    if (!paired.ok) throw new Error('test-pairing-failed');
    delivery.register(paired.device.id, {
      token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
      platform: 'ios',
    });
    const request = await seed(f, 'tool');
    f.registry.update('alice-bot', { displayName: 'Planner' });
    await delivery.reconcile();
    await delivery.reconcile();
    expect(sent.filter((message) => message.data.itemId)).toHaveLength(1);
    masked(sent);
    expect(sent[0]?.data).toMatchObject({
      messageId: request.id,
      approval: { masked: true },
      sender: 'Planner',
      author: { kind: 'bot', slug: 'alice-bot', displayName: 'Planner' },
    });
    expect(sent[0]?.categoryId).toBeUndefined();
  });

  it('routes unattended requests to the Bot owner once and removes that fallback when an approver joins', async () => {
    const f = fixture();
    await seed(f, 'question');
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(1);
    const source = activityListPushSource(f.attention, (slug) => slug);
    expect(source.pending(alice).items).toHaveLength(1);
    expect(source.pending(alice).items).toHaveLength(1);
    f.database.transaction((db) =>
      db
        .prepare(`INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
      VALUES (?, 'admin', 'Admin', 0, ?)`)
        .run(f.group.id, new Date().toISOString()),
    );
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(0);
    expect(f.attention.list(admin, { category: 'action' }).items).toHaveLength(1);
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = 'admin'").run(),
    );
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(1);
  });

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

  it('commits a real tool decision once with the authenticated Human ID', async () => {
    const f = fixture();
    const sessionId = 'm5-real-tool';
    f.ownership.claim({
      sessionId,
      botSlug: 'owner-bot',
      rootRole: 'orchestrator',
      at: new Date().toISOString(),
    });
    const agent: Agent = Object.assign(Object.create(null), {
      session: { id: sessionId, header: { cwd: '/' } },
    });
    const callId = ToolCallId('shell-1');
    f.toolApproval.track({
      agent,
      name: 'bash',
      callId,
      arguments: { command: 'CONFIDENTIAL_INPUT' },
      token: Object.assign(Object.create(null), Symbol('approval')),
      rootCallId: callId,
      signal: new AbortController().signal,
    });
    const pending = f.toolApproval.ask({ agent, toolName: 'bash', callId });
    await vi.waitFor(() => expect(f.toolApproval.requests('owner-bot')).toHaveLength(1));
    const request = f.toolApproval.requests('owner-bot')[0]!;
    const input = { channelId: f.group.id, messageId: request.messageId, outcome: 'allowed-once' };
    await expect(f.invoke(bob, 'toolApprovalDecide', input)).rejects.toMatchObject({
      code: 'approval-not-allowed',
    });
    expect(f.toolApproval.status('owner-bot', request.messageId)).toBe('pending');
    expect(await f.invoke(owner, 'toolApprovalDecide', input)).toEqual({ accepted: true });
    expect(await pending).toBe('allowed-once');
    await expect(f.invoke(owner, 'toolApprovalDecide', input)).rejects.toMatchObject({
      code: 'invalid-input',
    });
    const decision = f.channels
      .readMessages(f.group.id)
      .find((message) => message.toolApprovalDecision);
    expect(decision?.toolApprovalDecision?.decidedBy).toMatchObject({ humanId: owner.humanId });
    if (!decision) throw new Error('Missing tool decision');
    await humanProjections(f, decision, owner);
    expect(decision?.author).toEqual({
      kind: 'human',
      humanId: owner.humanId,
      displayName: f.team.mode(owner).viewer.displayName,
    });
    masked(await f.invoke(bob, 'channelMessages', { channelId: f.group.id }));
  });

  it('commits a real question answer and retains its decider', async () => {
    const f = fixture();
    f.team.channelAccess.addMember(bob, f.group.id, alice.humanId);
    f.team.channelAccess.policySet(bob, f.group.id, {
      addMembers: 'everyone',
      post: 'admins',
      mentionAll: 'admins',
      addBots: 'admins',
      editDetails: 'admins',
    });
    await expect(
      f.invoke(alice, 'channelSend', { channelId: f.group.id, body: 'ordinary post' }),
    ).rejects.toMatchObject({ code: 'channel-post-restricted' });
    const sessionId = 'm5-real-question';
    f.ownership.claim({
      sessionId,
      botSlug: 'alice-bot',
      rootRole: 'orchestrator',
      at: new Date().toISOString(),
    });
    const agent: Agent = Object.assign(Object.create(null), {
      session: { id: sessionId, header: { cwd: '/' } },
    });
    const pending = f.userQuestions.ask({
      agent,
      questions: [{ id: 'q', question: 'CONFIDENTIAL_QUESTION' }],
    });
    await vi.waitFor(() => expect(f.userQuestions.requests('alice-bot')).toHaveLength(1));
    const request = f.userQuestions.requests('alice-bot')[0]!;
    const answer = { answers: [{ id: 'q', selected: [], custom: 'Answer' }] };
    expect(
      await f.invoke(alice, 'userQuestionAnswer', {
        channelId: f.group.id,
        messageId: request.messageId,
        answer,
      }),
    ).toEqual({ accepted: true });
    expect(await pending).toEqual(answer);
    expect(
      f.channels.readMessages(f.group.id).find((message) => message.userQuestionResolution)
        ?.userQuestionResolution?.decidedBy,
    ).toMatchObject({ humanId: 'alice' });
    expect(
      f.channels.readMessages(f.group.id).find((message) => message.userQuestionResolution)?.author,
    ).toEqual({ kind: 'human', humanId: alice.humanId, displayName: 'alice' });
    const decision = f.channels
      .readMessages(f.group.id)
      .find((message) => message.userQuestionResolution);
    if (!decision) throw new Error('Missing question resolution');
    await humanProjections(f, decision);
  });

  it('authorizes secret submission in the service, records its decider and never projects saved values', async () => {
    const f = fixture();
    const sessionId = 'm5-real-secret';
    const fiber = f.ctx.plugin(LocalCredentialProvider, {
      path: join(createTempRoot('m5-credentials-'), 'credentials.yaml'),
      watch: false,
    });
    await fiber.await();
    f.ownership.claim({
      sessionId,
      botSlug: 'alice-bot',
      rootRole: 'orchestrator',
      at: new Date().toISOString(),
    });
    const agent: Agent = Object.assign(Object.create(null), { session: { id: sessionId } });
    const privateInputs = new PrivateInputs({
      channels: f.channels,
      registry: f.registry,
      ownership: f.ownership,
      approvals: f.team.approvals,
      credentials: () => f.ctx.credentials,
      isLive: () => true,
      canRequest: () => true,
      askChannel: () => f.group.id,
      qualified: async () => true,
      log() {},
    });
    closes.push(() => privateInputs.close());
    const wait = privateInputs.ask(
      agent,
      {
        account: 'controlled',
        purpose: 'CONFIDENTIAL_PROMPT',
        fields: [{ id: 'key', label: 'Key', required: true }],
      },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(privateInputs.activeMessageIds()).toHaveLength(1));
    const messageId = privateInputs.activeMessageIds()[0]!;
    const input = { channelId: f.group.id, messageId, values: { key: 'SYNTHETIC_PRIVATE_VALUE' } };
    await expect(privateInputs.submission(true, input, bob)).rejects.toMatchObject({
      code: 'approval-not-allowed',
    });
    expect(await privateInputs.submission(true, input, alice)).toEqual({ accepted: true });
    expect((await wait).status).toBe('configured');
    const decision = f.channels
      .readMessages(f.group.id)
      .find((message) => message.privateInputResolution);
    expect(decision?.privateInputResolution?.decidedBy).toMatchObject({ humanId: 'alice' });
    if (!decision) throw new Error('Missing private resolution');
    await humanProjections(f, decision);
    expect(decision?.author).toEqual({
      kind: 'human',
      humanId: alice.humanId,
      displayName: 'alice',
    });
    const page = await f.invoke(bob, 'channelMessages', { channelId: f.group.id });
    masked(page);
    expect(JSON.stringify(page)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    expect(JSON.stringify(f.channels.readMessages(f.group.id))).not.toContain(
      'SYNTHETIC_PRIVATE_VALUE',
    );
  });

  it('refuses approval calls on every existing browser Peer after member revocation', async () => {
    const f = fixture();
    const request = await seed(f, 'question');
    await f.team.asMember('bob', async (first) =>
      f.team.asMember('bob', async (second) => {
        await f.team.deactivate(owner, 'bob');
        for (const peer of [first, second]) {
          expect(peer.signal.aborted).toBe(true);
          await expect(
            f.gateway.invoke({
              namespace: 'botharness',
              method: 'userQuestionAnswer',
              peer,
              args: {
                channelId: f.group.id,
                messageId: request.id,
                answer: { answers: [] },
              },
            }),
          ).rejects.toMatchObject({ code: 'gateway/peer-disposed' });
        }
      }),
    );
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

  it('requires current roles, refuses suspended deciders and never grants an unjoined administrator access', async () => {
    const f = fixture();
    const request = await seed(f, 'tool');
    expect(() => f.team.approvals.requireRequest(admin, f.group.id, request.id)).toThrow(
      'approval-not-allowed',
    );
    expect(() => f.team.approvals.require(alice, 'alice-bot', true)).toThrow('permission-required');
    f.database.transaction((db) =>
      db.prepare("INSERT INTO human_roles VALUES ('alice', 'admin')").run(),
    );
    expect(() => f.team.approvals.require(alice, 'alice-bot', true)).not.toThrow();
    f.database.transaction((db) =>
      db.prepare("DELETE FROM human_roles WHERE human_id = 'alice' AND role_id = 'admin'").run(),
    );
    expect(() => f.team.approvals.require(alice, 'alice-bot', true)).toThrow('permission-required');
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = 'alice'").run(),
    );
    expect(() => f.team.approvals.require(alice, 'alice-bot')).toThrow('approval-not-allowed');
  });

  it('exposes the trial isolation contract without changing the CLI status payload', async () => {
    const f = fixture();
    expect(await f.invoke(bob, 'teamMode', {})).toMatchObject({
      enabled: true,
      isolation: 'trial',
      viewer: { humanId: 'bob' },
    });
    expect(await f.invoke(owner, 'teamMode', {})).toMatchObject({
      isolation: 'trial',
      viewer: { kind: 'owner' },
    });
  });
});

describe('M5 configuration and execution fences', () => {
  it.each(['danger-full-access', 'never', 'escalation'] as const)(
    'refuses member Bot %s at the execution boundary',
    async (mode) => {
      const f = fixture();
      const sessionId = 'm5-execution';
      f.ownership.claim({
        sessionId,
        botSlug: 'alice-bot',
        rootRole: 'orchestrator',
        at: new Date().toISOString(),
      });
      const session = Session.create(SessionId(sessionId));
      setSandboxMode(
        session,
        mode === 'danger-full-access' ? 'danger-full-access' : 'workspace-write',
      );
      setApprovalPolicy(session, mode === 'never' ? 'never' : 'ask');
      new SessionProjectionRegistry(f.ctx);
      const policy = new SandboxPolicyService(f.ctx, { mode: 'workspace-write' });
      const approval = new ApprovalService(f.ctx, { policy: 'ask' });
      await policy[Service.init]();
      await approval[Service.init]();
      const core = {
        registry: f.registry,
        team: f.team,
        ownership: f.ownership,
        assignmentAccess: f.assignmentAccess,
        runtime: Object.assign(Object.create(null), { getAssignment: () => undefined }),
        grants: Object.assign(Object.create(null), {}),
        hostTools: new Set<string>(),
      };
      expect(orchestratorPermission(core, 'alice-bot')).toEqual({
        mode: 'workspace-write',
        approval: 'ask',
      });
      expect(sessionHasFullAccess(core, sessionId)).toBe(false);
      if (mode !== 'escalation')
        expect(grantExecutionDenial(core, session, policy, approval)).toBe('permission-required');
      else {
        const memory = f.registry.memoryDirFor('alice-bot');
        const run = Session.create(SessionId(sessionId), [], { ...session.header, cwd: memory! });
        setSandboxMode(run, 'workspace-write');
        setApprovalPolicy(run, 'ask');
        expect(
          grantToolExecutionDenial(
            core,
            run,
            policy,
            approval,
            'bash',
            { sandbox_permissions: 'require_escalated' },
            true,
          ),
        ).toBe('permission-required');
      }
    },
  );

  it.each(['chat', 'assignments'] as const)(
    'keeps dangerous %s access Owner-only and refuses member Bots even to the Owner',
    async (scope) => {
      const f = fixture();
      expect(
        f.methods(alice).assignmentAccessSet({
          slug: 'alice-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: false, error: { code: 'owner-only' } });
      expect(
        f.methods(owner).assignmentAccessSet({
          slug: 'alice-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
      expect(() => f.assignmentAccess.set('alice-bot', 'danger-full-access', scope, owner)).toThrow(
        'permission-required',
      );
      expect(() => f.assignmentAccess.set('owner-bot', 'danger-full-access', scope, alice)).toThrow(
        'owner-only',
      );
      expect(
        f.methods(owner).assignmentAccessSet({
          slug: 'owner-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: true });
    },
  );
});

import type { TimedQuestionPort } from '../src/channels/user-questions.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { expect } from 'vitest';
import { TeamService } from '../src/team/service.js';
import { memberPolicy } from '../src/team/policy.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createFakeRosterDomain, createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createAssignmentAccessStore } from '../src/workspaces/assignment-access.js';

export const alice = humanContext('alice');

export const bob = humanContext('bob');

export const admin = humanContext('admin');

export const closes: Array<() => Promise<void> | void> = [];

export function fixture(
  timed?: (
    ctx: Context,
    database: ReturnType<typeof attachOperationalModule>,
    ownership: ReturnType<typeof createTestOwnership>,
  ) => TimedQuestionPort,
) {
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
  database.transaction((db) =>
    db
      .prepare(
        "INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at) SELECT ?,human_id,display_name,1,'now' FROM humans WHERE human_id IN ('alice','local-human')",
      )
      .run(group.id),
  );
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
    () => ({ kind: 'turn', channelId: group.id }),
    undefined,
    undefined,
    team.approvals,
  );
  const ctx = new Context();
  const userQuestions = new ChannelUserQuestions(
    channels,
    ownership,
    undefined,
    undefined,
    undefined,
    timed?.(ctx, database, ownership),
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
    root,
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

export async function seed(
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
  const target = f.channels.get(channelId);
  const historicalCardWriter =
    target?.type === 'dm' && !target.botSlug && !!target.humanParticipants
      ? createSqliteChannelStore({ database: f.database, rootDir: join(f.root, 'channels') })
      : f.channels;
  await historicalCardWriter.appendMessage(owner, channelId, message);
  f.active.push(message.id);
  return message;
}

export function masked(value: unknown, id?: string) {
  const wire = JSON.stringify(value);
  for (const secret of secrets) expect(wire).not.toContain(secret);
  expect(wire).not.toContain('"toolName"');
  expect(wire).toContain('"masked":true');
  if (id) expect(wire).toContain(id);
}

export async function humanProjections(
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
    [
      'channelSearch',
      {
        ...input,
        text:
          message.toolApprovalDecision ||
          message.userQuestionResolution ||
          message.privateInputResolution
            ? f.channels.message(f.group.id, message.replyTo!)?.author.kind === 'bot'
              ? Reflect.get(f.channels.message(f.group.id, message.replyTo!)!.author, 'slug')
              : 'alice-bot'
            : message.body,
      },
    ],
    [
      'messageSearch',
      {
        text:
          message.toolApprovalDecision ||
          message.userQuestionResolution ||
          message.privateInputResolution
            ? f.channels.message(f.group.id, message.replyTo!)?.author.kind === 'bot'
              ? Reflect.get(f.channels.message(f.group.id, message.replyTo!)!.author, 'slug')
              : 'alice-bot'
            : message.body,
      },
    ],
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

export const cleanup = async () => {
  for (const close of closes.splice(0).reverse()) await close();
};

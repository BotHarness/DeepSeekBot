import { questionAnswerReceipts } from '../src/channels/question-answer-receipts.js';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createTeamHttp, TEAM_PATH, MEMBER_COOKIE } from '../src/team/http.js';
import { hashPassword } from '../src/team/password.js';
import { nativeTimedQuestions } from '../src/channels/native-timed-questions.js';
import type { TimedQuestionPort } from '../src/channels/user-questions.js';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelMessage } from '../src/channels/channel.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import {
  alice,
  bob,
  admin,
  closes,
  fixture,
  seed,
  masked,
  humanProjections,
  cleanup,
} from './team-approvals-fixtures.js';

afterEach(cleanup);

describe('M5 approval projections and decisions', () => {
  it.each(['no-template', 'ask-human', 'allow'] as const)(
    'keeps shared-Bot approval and %s Reviewer records in the requesting participant DM',
    async (mode) => {
      const f = fixture();
      f.team.bots.setVisibility(owner, 'alice-bot', {
        kind: 'public',
        audience: { kind: 'everyone' },
      });
      const principalDm = f.channels.getOrCreateDm(alice, 'alice-bot', 'Alice Bot')!;
      const memberDm = f.channels.getOrCreateDm(bob, 'alice-bot', 'Alice Bot')!;
      expect(memberDm.id).not.toBe(principalDm.id);
      const sessionId = 'participant-approval-' + mode;
      f.ownership.claim({
        sessionId,
        botSlug: 'alice-bot',
        rootRole: 'orchestrator',
        at: new Date().toISOString(),
      });
      const agent: Agent = Object.assign(Object.create(null), {
        session: { id: sessionId, header: { cwd: '/' }, snapshotEvents: () => [] },
      });
      const review = vi.fn(async () => ({
        outcome: mode === 'allow' ? ('allow' as const) : ('ask-human' as const),
        reason: 'PARTICIPANT_REVIEW_REASON',
      }));
      const broker = new ChannelToolApproval(
        f.channels,
        f.ownership,
        undefined,
        undefined,
        undefined,
        undefined,
        () => ({ kind: 'turn', channelId: memberDm.id }),
        {
          template: () =>
            mode === 'no-template' ? undefined : { name: 'qa', text: 'Ask when uncertain.' },
          review,
          log() {},
        },
        () => false,
        f.team.approvals,
      );
      const callId = ToolCallId('participant-call');
      broker.track({
        agent,
        name: 'bot_send_message',
        callId,
        rootCallId: callId,
        arguments: { body: 'PARTICIPANT_PRIVATE_INPUT' },
        token: Object.assign(Object.create(null), Symbol('approval')),
        signal: new AbortController().signal,
      });
      const pending = broker.ask({ agent, toolName: 'bot_send_message', callId });
      try {
        if (mode === 'allow') {
          expect(await pending).toBe('allowed-once');
        } else {
          await vi.waitFor(() => expect(broker.requests('alice-bot')).toHaveLength(1));
          const request = broker.requests('alice-bot')[0]!;
          expect(request.channelId).toBe(memberDm.id);
          expect(() =>
            f.team.approvals.requireRequest(alice, memberDm.id, request.messageId),
          ).toThrow();
          expect(() =>
            f.team.approvals.requireRequest(bob, memberDm.id, request.messageId),
          ).toThrow();
          const projection = f.team.approvals.project(bob, {
            channelId: memberDm.id,
            message: f.channels.message(memberDm.id, request.messageId),
          });
          masked(projection);
          expect(JSON.stringify(projection)).not.toContain('PARTICIPANT_PRIVATE_INPUT');
        }
        expect(JSON.stringify(f.channels.readMessages(principalDm.id))).not.toContain(
          'PARTICIPANT_',
        );
        const memberMessages = f.channels.readMessages(memberDm.id);
        expect(JSON.stringify(memberMessages)).toContain('PARTICIPANT_PRIVATE_INPUT');
        if (mode !== 'no-template') {
          expect(review).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ call: expect.objectContaining({ channelId: memberDm.id }) }),
          );
          expect(memberMessages.some((message) => message.toolAutoApproval !== undefined)).toBe(
            true,
          );
        } else expect(review).not.toHaveBeenCalled();
        await expect(
          f.invoke(alice, 'channelMessages', { channelId: memberDm.id }),
        ).rejects.toMatchObject({ code: 'remote-access/denied' });
      } finally {
        broker.close();
        await pending;
      }
    },
  );

  it.each([undefined, 'missing-origin', 'dm-owner-bot'])(
    'refuses unavailable or mismatched approval origin %s without falling back to the principal DM',
    async (origin) => {
      const f = fixture();
      const sessionId = 'invalid-origin';
      f.ownership.claim({
        sessionId,
        botSlug: 'alice-bot',
        rootRole: 'orchestrator',
        at: new Date().toISOString(),
      });
      const agent: Agent = Object.assign(Object.create(null), {
        session: { id: sessionId, header: { cwd: '/' } },
      });
      const review = vi.fn();
      const broker = new ChannelToolApproval(
        f.channels,
        f.ownership,
        undefined,
        undefined,
        undefined,
        undefined,
        () => (origin === undefined ? undefined : { kind: 'turn', channelId: origin }),
        { template: () => ({ name: 'qa', text: 'Review.' }), review, log() {} },
      );
      const callId = ToolCallId('invalid-origin-call');
      broker.track({
        agent,
        name: 'bash',
        callId,
        rootCallId: callId,
        arguments: { command: 'PARTICIPANT_PRIVATE_INPUT' },
        token: Object.assign(Object.create(null), Symbol('approval')),
        signal: new AbortController().signal,
      });
      try {
        expect(await broker.ask({ agent, toolName: 'bash', callId })).toBe('unavailable');
        expect(review).not.toHaveBeenCalled();
        expect(broker.requests('alice-bot')).toEqual([]);
        expect(JSON.stringify(f.channels.readMessages('dm-alice-bot'))).not.toContain(
          'PARTICIPANT_',
        );
        expect(JSON.stringify(f.channels.readMessages('dm-owner-bot'))).not.toContain(
          'PARTICIPANT_',
        );
      } finally {
        broker.close();
      }
    },
  );

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

  it.each([
    { human: alice, revoke: false },
    { human: owner, revoke: false },
    { human: alice, revoke: true },
  ])(
    'persists a native timed answer through the authenticated $human.humanId path (revoked: $revoke)',
    async ({ human, revoke }) => {
      const local = createRequire(import.meta.url);
      const foreign: typeof import('@deepseek-ai/dsh-session') = await import(
        pathToFileURL(local.resolve('@deepseek-ai/dsh-session')).href + '?m5-carrier'
      );
      const session = foreign.Session.create(SessionId('m5-native-answer'));
      expect(session).not.toBeInstanceOf(Session);
      let nativeAnswered = false;
      let timed: TimedQuestionPort | undefined;
      const f = fixture((ctx, database, ownership) => {
        timed = nativeTimedQuestions(
          ctx,
          Object.assign(Object.create(null), {}),
          {
            get: () => session,
            list: () => [session],
          },
          questionAnswerReceipts(database, (id) => ownership.resolve(id)?.botSlug),
        );
        return timed;
      });
      const botSlug = human === owner ? 'owner-bot' : 'alice-bot';
      const agent: Agent = Object.assign(Object.create(null), { session });
      f.ownership.claim({
        sessionId: session.id,
        botSlug,
        rootRole: 'orchestrator',
        at: new Date().toISOString(),
      });
      f.ctx.provide('agents');
      f.ctx.set('agents', Object.assign(Object.create(null), { get: () => agent }));
      f.ctx.provide('sessionProjections');
      f.ctx.set(
        'sessionProjections',
        Object.assign(Object.create(null), {
          stateOf: () => ({
            questions: nativeAnswered
              ? {
                  active: [],
                  settled: [
                    { callId: 'pick-plan', answers: [{ id: 'plan', selected: ['Plan A'] }] },
                  ],
                }
              : { active: [{ callId: 'pick-plan', state: 'open' }], settled: [] },
          }),
        }),
      );
      const pending = f.userQuestions.ask({
        agent,
        questions: [
          {
            id: 'plan',
            question: 'PRIVATE_QUESTION',
            options: [{ label: 'Plan A' }, { label: 'Plan B' }],
          },
        ],
        wait: { callId: ToolCallId('pick-plan'), timed: true },
      });
      void pending.catch(() => {});
      await vi.waitFor(() => expect(f.userQuestions.requests(botSlug)).toHaveLength(1));
      const request = f.userQuestions.requests(botSlug)[0]!;
      const payload = {
        channelId: f.group.id,
        messageId: request.messageId,
        answer: { answers: [{ id: 'plan', selected: ['Plan A'] }] },
      };
      if (human === owner)
        expect(await f.invoke(owner, 'userQuestionAnswer', payload)).toEqual({ accepted: true });
      else {
        const password = 'member-answer-password-1';
        const hash = await hashPassword(password);
        f.database.transaction((db) =>
          db
            .prepare('UPDATE member_credentials SET password_json = ? WHERE human_id = ?')
            .run(JSON.stringify(hash), human.humanId),
        );
        const login = await f.team.signIn(human.humanId, password, '127.0.0.1');
        const handler = createTeamHttp({
          team: f.team,
          gateway: f.gateway,
          hostName: () => 'Test',
          tls: () => false,
          readResource: async () => new Response(),
          fetchBundle: async () => new Response(),
        });
        const server = createServer((request, response) => void handler.handle(request, response));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        closes.push(async () => {
          await handler.close();
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing test address');
        const response = await fetch(`http://127.0.0.1:${address.port}${TEAM_PATH}/__share/rpc`, {
          method: 'POST',
          headers: {
            cookie: `${MEMBER_COOKIE}=${login.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            op: 'call',
            path: '/api/botharness/userQuestionAnswer',
            body: {
              type: 'client-request',
              rpcId: 'answer-test',
              method: 'botharness/userQuestionAnswer',
              payload: { args: payload },
            },
          }),
        });
        expect(await response.json()).toMatchObject({
          result: { ok: true, value: { accepted: true } },
        });
      }
      expect(await pending).toEqual(payload.answer);
      const snapshot = vi.spyOn(session, 'snapshotEvents');
      nativeAnswered = true;
      if (revoke) {
        f.database.transaction((db) =>
          db
            .prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?")
            .run(human.humanId),
        );
        expect(() => f.team.approvals.requireRequest(human, f.group.id, request.messageId)).toThrow(
          'approval-not-allowed',
        );
        f.userQuestions.close();
        await f.userQuestions.recover([{ channelId: f.group.id, messageId: request.messageId }]);
      }
      await f.userQuestions.reconcileSession(session.id);
      const resolution = f.channels.readMessages(f.group.id).find((m) => m.userQuestionResolution);
      expect(resolution?.userQuestionResolution?.decidedBy?.humanId).toBe(human.humanId);
      expect(resolution?.author).toMatchObject({ kind: 'human', humanId: human.humanId });
      expect(timed?.answeringHuman?.(session.id, 'pick-plan', payload.answer)).toEqual(human);
      expect(snapshot).not.toHaveBeenCalled();
      await f.userQuestions.reconcileSession(session.id);
      await f.channels.reconcileQuestionAnswer(
        human,
        f.group.id,
        { messageId: request.messageId, sessionId: session.id, callId: 'pick-plan' },
        payload.answer,
      );
      expect(
        f.channels.readMessages(f.group.id).filter((m) => m.userQuestionResolution),
      ).toHaveLength(1);
      if (revoke) {
        const next = f.userQuestions.ask({
          agent,
          questions: [{ id: 'q', question: 'New request' }],
          wait: { callId: ToolCallId('new-request'), timed: true },
        });
        await expect(next).rejects.toMatchObject({ code: 'bot-channel-access-denied' });
      }
    },
  );

  it('commits a real question answer and retains its decider', async () => {
    const f = fixture();
    f.team.channelAccess.addMember(bob, f.group.id, alice.humanId);
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

  it.each(['public', 'roles'] as const)(
    'auto-joins an administrator into a %s Group so its requests are not masked',
    async (visibility) => {
      const f = fixture();
      f.team.channelAccess.visibilitySet(
        bob,
        f.group.id,
        visibility === 'public'
          ? { kind: 'public' }
          : { kind: 'roles', roleIds: ['member', 'admin'] },
      );
      expect(
        f.database.read((db) =>
          db
            .prepare(
              "SELECT membership_basis AS basis FROM channel_human_members WHERE channel_id = ? AND human_id = 'admin' AND left_at IS NULL",
            )
            .get(f.group.id),
        ),
      ).toEqual({ basis: 'role' });
      const request = await seed(f, 'question');
      expect(() => f.team.approvals.requireRequest(alice, f.group.id, request.id)).not.toThrow();
      expect(f.team.approvals.card(alice, f.group.id, request)?.masked).toBe(false);
      expect(() => f.team.approvals.requireRequest(admin, f.group.id, request.id)).not.toThrow();
      expect(f.team.approvals.card(admin, f.group.id, request)?.masked).toBe(false);
    },
  );

  it.each(['tool', 'question', 'secret'] as const)(
    'hides %s approval text in owner DM trace previews, including stale targets',
    async (kind) => {
      const f = fixture();
      const dm = f.channels.getOrCreateDm(alice, 'alice-bot', 'Planner')!;
      const request = await seed(f, kind);
      const trace = f.channels
        .readMessages(dm.id)
        .find((m) => m.botChannelPost?.messageId === request.id)!;
      expect(trace.botChannelPostPreview).toContain('CONFIDENTIAL');
      if (kind === 'tool')
        masked(await f.invoke(alice, 'channelMessages', { channelId: dm.id }), request.id);
      expect(f.team.approvals.project(alice, trace, dm.id).botChannelPostPreview).toBe(
        kind === 'tool' ? null : trace.botChannelPostPreview,
      );
      const read = f.channels.message.bind(f.channels);
      for (const state of ['missing', 'purged'] as const) {
        const spy = vi.spyOn(f.channels, 'message').mockImplementation((channel, id) =>
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
            : read(channel, id),
        );
        expect(f.team.approvals.project(alice, trace, dm.id).botChannelPostPreview).toBeNull();
        spy.mockRestore();
      }
      const ordinary = {
        id: randomUUID(),
        at: request.at,
        author: request.author,
        body: 'Ordinary',
      };
      await f.channels.appendMessage(owner, f.group.id, ordinary);
      const normalTrace = f.channels
        .readMessages(dm.id)
        .find((m) => m.botChannelPost?.messageId === ordinary.id)!;
      expect(f.team.approvals.project(alice, normalTrace, dm.id).botChannelPostPreview).toBe(
        'Ordinary',
      );
    },
  );

  it.each(['tool', 'question', 'secret'] as const)(
    'hides replies quoting a %s resolution by following its original request',
    async (kind) => {
      const f = fixture();
      const request = await seed(f, kind, 'owner-bot');
      const resolution: ChannelMessage = {
        id: randomUUID(),
        at: request.at,
        author: { kind: 'human' },
        body: 'CONFIDENTIAL_ANSWER',
        replyTo: request.id,
        ...(kind === 'tool'
          ? {
              toolApprovalDecision: {
                requestMessageId: request.id,
                outcome: 'allowed-once' as const,
                decidedBy: { humanId: owner.humanId },
              },
            }
          : kind === 'question'
            ? {
                userQuestionResolution: {
                  requestMessageId: request.id,
                  state: 'answered' as const,
                  decidedBy: { humanId: owner.humanId },
                  answers: [{ id: 'q', selected: ['CONFIDENTIAL_ANSWER'] }],
                },
              }
            : {
                privateInputResolution: {
                  requestMessageId: request.id,
                  state: 'configured' as const,
                  references: {},
                  decidedBy: { humanId: owner.humanId },
                },
              }),
      };
      await f.channels.appendMessage(owner, f.group.id, resolution);
      const reply: ChannelMessage = {
        id: randomUUID(),
        at: request.at,
        author: { kind: 'human' },
        body: 'Public reply',
        replyTo: resolution.id,
      };
      await f.channels.appendMessage(bob, f.group.id, reply);
      const canonical = f.channels.message(f.group.id, reply.id)!;
      expect(canonical.replyToPreview?.body).toBe('CONFIDENTIAL_ANSWER');
      expect(f.team.approvals.project(bob, canonical, f.group.id).replyToPreview).toBeNull();
      f.database.transaction((db) =>
        db
          .prepare(
            `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) VALUES (?, 'admin', 'Admin', 0, ?)`,
          )
          .run(f.group.id, request.at),
      );
      expect(f.team.approvals.project(admin, canonical, f.group.id).replyToPreview?.body).toBe(
        'CONFIDENTIAL_ANSWER',
      );
      const read = f.channels.message.bind(f.channels);
      for (const state of ['missing', 'purged'] as const) {
        const spy = vi.spyOn(f.channels, 'message').mockImplementation((channel, id) =>
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
            : read(channel, id),
        );
        expect(f.team.approvals.project(admin, canonical, f.group.id).replyToPreview).toBeNull();
        spy.mockRestore();
      }
    },
  );

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
});

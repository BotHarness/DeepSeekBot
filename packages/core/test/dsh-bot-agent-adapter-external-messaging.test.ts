import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools } from './support/dsh-bot-agent-adapter.js';

it('routes external Tools through the active owning Orchestrator without a local inbound Channel', async () => {
  const replies: string[][] = [];
  const reads: string[] = [];
  const permissionsRead = vi.fn(() => ({
    queriedAt: '2026-10-11T00:00:00Z',
    status: 'visitor' as const,
  }));
  const directoryRead = vi.fn(() => ({
    kind: 'observed-people' as const,
    queriedAt: '2026-10-11T00:00:00Z',
    policyRevision: 1,
    rows: [],
    coverage: {
      kind: 'retained-authorized-observations' as const,
      incomplete: true,
      currentPlatformMembership: false as const,
    },
  }));
  let latePost: (() => Promise<unknown>) | undefined;
  const signal = new AbortController().signal;
  const contextRead = vi.fn<NonNullable<OrchestratorAgentRun['externalMessaging']>['context']>(
    async () => ({
      scope: 'thread',
      messages: [],
      omitted: 0,
      incomplete: false,
      coverage: 'provider-visible-human-text',
    }),
  );
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        const permissions = tools.find((tool) => tool.name === 'bridge_sender_permissions');
        if (!permissions) throw new Error('permission tool unavailable');
        expect(
          JSON.parse(
            String(
              await permissions.execute({ source_event_id: 'source-1' }, {
                signal,
              } as ToolRunContext),
            ),
          ),
        ).toEqual({ queriedAt: '2026-10-11T00:00:00Z', status: 'visitor' });
        await permissions.execute({ source_event_id: 'source-1' }, { signal } as ToolRunContext);
        expect(permissionsRead).toHaveBeenCalledTimes(2);
        expect(permissionsRead).toHaveBeenCalledWith('source-1');
        const directory = tools.find((tool) => tool.name === 'bridge_directory');
        if (!directory) throw new Error('directory tool unavailable');
        await directory.execute(
          { kind: 'observed-people', source_event_id: 'source-1', limit: 1 },
          { signal } as ToolRunContext,
        );
        expect(directoryRead).toHaveBeenCalledWith({
          kind: 'observed-people',
          sourceEventId: 'source-1',
          limit: 1,
        });
        const contextTool = tools.find((tool) => tool.name === 'bridge_context');
        if (!contextTool) throw new Error('context tool unavailable');
        await contextTool.execute(
          { source_event_id: 'source-1', scope: 'thread', cursor: 'opaque', max_characters: 1000 },
          { signal } as ToolRunContext,
        );
        expect(contextRead).toHaveBeenCalledWith(
          'source-1',
          { scope: 'thread', cursor: 'opaque', maxCharacters: 1000 },
          signal,
        );
        const groups = tools.find((tool) => tool.name === 'bridge_reachable_groups');
        if (!groups) throw new Error('reachable groups tool unavailable');
        expect(JSON.parse(String(await groups.execute({}, { signal } as ToolRunContext)))).toEqual([
          {
            bindingId: 'owned-app',
            platform: 'feishu',
            accountName: 'Owned app',
            page: {
              version: 1,
              conversations: [{ id: 'oc_new', kind: 'group', name: 'New group' }],
              hasMore: false,
            },
          },
        ]);
        const targets = tools.find((tool) => tool.name === 'bridge_targets');
        const post = tools.find((tool) => tool.name === 'bot_send_message');
        const outbox = tools.find((tool) => tool.name === 'bridge_outbox');
        if (!targets || !post || !outbox) throw new Error('outbox tools unavailable');
        expect(JSON.parse(String(await targets.execute({}, { signal } as ToolRunContext)))).toEqual(
          [],
        );
        await expect(
          post.execute({ grant_id: 'grant', body: 'Report' }, { signal } as ToolRunContext),
        ).rejects.toThrow('post ownership sentinel');
        await expect(
          post.execute(
            {
              binding_id: 'owned-app',
              conversation_id: 'oc_new',
              body: 'Report',
            },
            { signal } as ToolRunContext,
          ),
        ).rejects.toThrow('reachable post ownership sentinel');
        await expect(
          outbox.execute({ intent_id: 'foreign' }, { signal } as ToolRunContext),
        ).rejects.toThrow('outbox ownership sentinel');
        latePost = () =>
          post.execute({ grant_id: 'grant', body: 'Report' }, { signal } as ToolRunContext);
        const read = tools.find((tool) => tool.name === 'bridge_read');
        const reply = tools.find((tool) => tool.name === 'bot_send_message');
        const share = tools.find((tool) => tool.name === 'bridge_share');
        if (!read || !reply || !share) throw new Error('external tools unavailable');
        expect(reply.parameters).toMatchObject({ required: ['body'] });
        expect(share.parameters).toMatchObject({ required: ['source_event_id', 'channel_id'] });
        const placed = await share.execute(
          { source_event_id: 'source-1', channel_id: 'group-team' },
          { signal } as ToolRunContext,
        );
        expect(JSON.parse(String(placed))).toMatchObject({
          sourceEventId: 'source-1',
          channelId: 'group-team',
          alreadyShared: false,
        });
        await expect(
          read.execute({ source_event_id: 'source-1' }, { signal } as ToolRunContext),
        ).rejects.toThrow('owned source sentinel');
        const result = await reply.execute(
          { source_event_id: 'source-1', body: 'Topic response' },
          { signal } as ToolRunContext,
        );
        expect(typeof result).toBe('string');
        if (typeof result !== 'string') throw new Error('Expected serialized tool result');
        expect(JSON.parse(result)).toMatchObject({
          status: 'committed',
          intentId: 'intent',
          messageId: 'reply-1',
        });
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
  });
  await adapter.runOrchestrator({
    sessionId: 'external-ada',
    replyDestination: (id) => ({
      kind: 'external',
      source: {
        id,
        body: 'Topic request',
        at: BOT.createdAt,
        platform: 'feishu',
        accountName: 'Owned app',
        conversationName: 'Team',
        grantId: 'grant',
        grantRevision: 1,
        event: {
          version: 1,
          channel: 'feishu',
          botId: BOT.slug,
          fingerprint: 'fingerprint',
          eventId: 'event-1',
          messageId: 'request-1',
          actor: { kind: 'user', id: 'sender-1' },
          conversation: { kind: 'group', id: 'team-1' },
          mentions: [],
          mentionedAccount: true,
          at: BOT.createdAt,
          reply: { messageId: 'request-1', conversationId: 'team-1', actorId: 'sender-1' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
      },
    }),
    resume: false,
    bot: BOT,
    inboundChannelId: undefined,
    inbox: 'External Inbox',
    message: 'External turn',
    externalMessaging: {
      connected: () => true,
      senderPermissions: permissionsRead,
      directory: directoryRead,
      reachable: async () => [
        {
          bindingId: 'owned-app',
          platform: 'feishu',
          accountName: 'Owned app',
          page: {
            version: 1,
            conversations: [{ id: 'oc_new', kind: 'group', name: 'New group' }],
            hasMore: false,
          },
        },
      ],
      postConversation: async () => {
        throw new Error('reachable post ownership sentinel');
      },
      targets: async () => [],
      post: async () => {
        throw new Error('post ownership sentinel');
      },
      outbox: () => {
        throw new Error('outbox ownership sentinel');
      },
      share: (sourceEventId, channelId) => ({
        sourceEventId,
        channelId,
        messageId: sourceEventId,
        revision: 1,
        alreadyShared: false,
      }),
      threads: async () => [],
      setThread: async () => {
        throw new Error('thread sentinel');
      },
      policies: async () => [],
      setPolicy: async () => {
        throw new Error('policy sentinel');
      },
      context: contextRead,
      saveFile: async () => {
        throw new Error('file sentinel');
      },
      replyFile: async () => {
        throw new Error('file sentinel');
      },
      read: (id) => {
        reads.push(id);
        throw new Error('owned source sentinel');
      },
      reply: async (id, text) => {
        replies.push([id, text]);
        return {
          id: 'intent',
          botSlug: BOT.slug,
          grantId: 'grant',
          grantRevision: 1,
          sourceEventId: id,
          text,
          state: 'provider-accepted',
          receipt: { version: 1, messageId: 'reply-1', conversationId: 'team-1' },
          createdAt: BOT.createdAt,
        };
      },
    },
    channels: {
      ...groupTools,
      contacts: async () => ({ outputLimit: 12000, contacts: [] }),
      sendToBot: async () => {
        throw new Error('unexpected DM');
      },
      ignore: () => ({
        sourceEventId: 'source-1',
        ignoredAt: BOT.createdAt,
        alreadyIgnored: false,
      }),
      read: () => [],
      requestGrant: async () => undefined as never,
      send: async () => {
        throw new Error('unexpected local message');
      },
    },
    assignments: {
      create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
      grants: () => [],
      list: () => [],
      inspect: () => undefined,
      stop: async () => ASSIGNMENT,
      request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
    },
  });
  await expect(latePost?.()).rejects.toThrow('Orchestrator run is unavailable');
  expect(reads).toEqual(['source-1']);
  expect(replies).toEqual([['source-1', 'Topic response']]);
  const tool = host.scopes
    .get('external-ada')
    ?.tools.find((item) => item.name === 'bot_send_message');
  await expect(
    tool?.execute({ source_event_id: 'source-1', body: 'Late response' }, {
      signal,
    } as ToolRunContext),
  ).rejects.toThrow('Orchestrator run is unavailable');
  expect(replies).toHaveLength(1);
  const contextTool = host.scopes
    .get('external-ada')
    ?.tools.find((item) => item.name === 'bridge_context');
  await expect(
    contextTool?.execute({ source_event_id: 'source-1', scope: 'thread' }, {
      signal,
    } as ToolRunContext),
  ).rejects.toThrow('bridge_context: unavailable');
  expect(contextRead).toHaveBeenCalledTimes(1);
  await adapter.close();
});

it('links a sent receipt to the Assignments the turn created or sent to', async () => {
  const sent: Record<string, unknown>[] = [];
  const linked: Record<string, unknown>[] = [];
  const outcomes: Promise<unknown>[] = [];
  const summary = (sessionId: string, title: string) => ({ sessionId, title }) as never;
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onAgentCreated: () => {
        const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
        const run = (name: string, args: Record<string, unknown>, id: string) =>
          tools
            .find((tool) => tool.name === name)!
            .execute(args, {
              callId: ToolCallId(id),
              signal: new AbortController().signal,
            } as ToolRunContext);
        outcomes.push(
          (async () => {
            await run('bot_send_message', { channel_id: 'dm-test', body: 'Starting both.' }, 'r');
            await run('send_assignment_request', { session_id: 'asg-old', text: 'Go on' }, 'a');
            await run(
              'create_assignment',
              { title: 'New', description: 'New work', grant_id: 'g' },
              'b',
            );
            await run('send_assignment_request', { session_id: 'asg-new', text: 'Also' }, 'c');
            return run(
              'link_message_sessions',
              { message_id: 'm1', session_ids: ['asg-new', 'asg-old', 'asg-new'] },
              'd',
            );
          })(),
        );
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
  });
  await adapter.runOrchestrator({
    sessionId: 'orchestrator-ada',
    resume: false,
    bot: BOT,
    message: 'Start both',
    inboundChannelId: 'dm-test',
    inbox: '',
    channels: {
      list: () => ({ channels: [{ id: 'dm-test', kind: 'human-dm' }] }),
      send: async (input: Record<string, unknown>) => {
        sent.push(input);
        return { id: 'm1', at: '', author: { kind: 'bot', slug: 'ada' }, body: input['body'] };
      },
      linkSessions: (input: Record<string, unknown>) => {
        linked.push(input);
        return {
          id: 'm1',
          at: '',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Starting both.',
          sessionLinks: (input['links'] as { sessionId: string; kind: string }[]).map(
            ({ sessionId, kind }) => ({ sessionId, kind, title: sessionId }),
          ),
        };
      },
    } as never,
    assignments: {
      create: () => ({ outcome: 'created', assignment: summary('asg-new', 'New') }),
      request: (input: { sessionId: string }) => ({
        assignment: summary(input.sessionId, input.sessionId === 'asg-new' ? 'New' : 'Old'),
        delivery: 'followup',
      }),
      inspect: (sessionId: string) =>
        ({
          sessionId,
          title: sessionId === 'asg-new' ? 'New' : 'Old',
          createdAt: '2026-01-01T00:00:00.000Z',
        }) as never,
    } as never,
  } as never);
  const [result] = (await Promise.all(outcomes)) as string[];
  expect(sent[0]?.['sessionLinks']).toBeUndefined();
  expect(linked).toEqual([
    {
      messageId: 'm1',
      links: [
        {
          sessionId: 'asg-new',
          kind: 'created',
          title: 'New',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        { sessionId: 'asg-old', kind: 'sent', title: 'Old', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    },
  ]);
  expect(JSON.parse(result!)).toEqual({
    outcome: 'linked',
    messageId: 'm1',
    sessions: [
      { sessionId: 'asg-new', kind: 'created' },
      { sessionId: 'asg-old', kind: 'sent' },
    ],
  });
});

it.each([
  { label: 'links forgotten Sessions to the turn’s only Human DM message', sends: 1 },
  { label: 'leaves Sessions unlinked when the turn sent two Human DM messages', sends: 2 },
])('$label', async ({ sends }) => {
  const linked: Record<string, unknown>[] = [];
  const outcomes: Promise<unknown>[] = [];
  let next = 0;
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onAgentCreated: () => {
        const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
        const run = (name: string, args: Record<string, unknown>, id: string) =>
          tools
            .find((tool) => tool.name === name)!
            .execute(args, {
              callId: ToolCallId(id),
              signal: new AbortController().signal,
            } as ToolRunContext);
        outcomes.push(
          (async () => {
            await run(
              'create_assignment',
              { title: 'New', description: 'New work', grant_id: 'g' },
              'a',
            );
            for (let index = 0; index < sends; index += 1)
              await run('bot_send_message', { channel_id: 'dm-test', body: 'On it.' }, `s${index}`);
          })(),
        );
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
  });
  await adapter.runOrchestrator({
    sessionId: 'orchestrator-ada',
    resume: false,
    bot: BOT,
    message: 'Start it',
    inboundChannelId: 'dm-test',
    inbox: '',
    channels: {
      list: () => ({ channels: [{ id: 'dm-test', kind: 'human-dm' }] }),
      send: async (input: Record<string, unknown>) => {
        next += 1;
        return {
          id: `m${next}`,
          at: '',
          author: { kind: 'bot', slug: 'ada' },
          body: input['body'],
        };
      },
      linkSessions: (input: Record<string, unknown>) => {
        linked.push(input);
        return { id: 'm1', at: '', author: { kind: 'bot', slug: 'ada' }, body: 'On it.' };
      },
    } as never,
    assignments: {
      create: () => ({
        outcome: 'created',
        assignment: { sessionId: 'asg-new', title: 'New' },
      }),
      inspect: (sessionId: string) =>
        ({ sessionId, title: 'New', createdAt: '2026-01-01T00:00:00.000Z' }) as never,
    } as never,
  } as never);
  await Promise.all(outcomes);
  expect(linked).toEqual(
    sends === 1
      ? [
          {
            messageId: 'm1',
            links: [
              {
                sessionId: 'asg-new',
                kind: 'created',
                title: 'New',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ]
      : [],
  );
});

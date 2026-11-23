import { TeamError } from '../src/team/error.js';
import { SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { isDshGovernedTool } from '../src/workspaces/grant-execution.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { defaultPromptText, promptTextOf } from '../src/prompts/prompt-parts.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRoot } from './helpers.js';
import {
  ORCHESTRATOR_TOOL_ORDER,
  ASSIGNMENT,
  groupTools,
  reportRun,
} from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it.each(['workspace-write', 'danger-full-access'] as const)(
    'appends the Session Skill guidance to an Assignment without granting Memory writes (%s)',
    async (mode) => {
      const host = new FakeAgentHost();
      let guidance = `${defaultPromptText('skill-installation')} Test preset.`;
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
        promptText: () => promptTextOf({ 'skill-installation': guidance }),
      });
      try {
        await adapter.runAssignment({
          sessionId: 'skill-assignment',
          bot: BOT,
          text: 'Install the project convention Skill',
          permission: {
            grantId: 'grant-1',
            workspaceId: 'workspace-1',
            primaryCwd: '/project',
            mode,
            approval: 'ask',
            presetRevision: 0,
          },
          report: vi.fn(),
        });
        const prompt = host.scopes
          .get('skill-assignment')!
          .sections.find((section) => section.name === 'botharness:assignment-role')!.text;
        expect(prompt.endsWith(`\n\n${guidance}`)).toBe(true);
        expect(prompt).toContain('only its Orchestrator may write freely');
        guidance = 'Refreshed after compaction.';
        expect(
          host.scopes
            .get('skill-assignment')!
            .sections.find((section) => section.name === 'botharness:assignment-role')!
            .text.endsWith('\n\nRefreshed after compaction.'),
        ).toBe(true);
      } finally {
        await adapter.close();
      }
    },
  );

  it('lets an Assignment, not the Orchestrator, discover its Bot Memory Skills', async () => {
    const memory = createTempRoot();
    mkdirSync(join(memory, '.agents/skills/release-notes'), { recursive: true });
    writeFileSync(
      join(memory, '.agents/skills/release-notes/SKILL.md'),
      '---\nname: release-notes\ndescription: Draft release notes\n---\nGroup merged PRs.\n',
    );
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => memory,
      ensureWorkspace: () => undefined,
    });
    try {
      await adapter.runAssignment({
        sessionId: 'memory-skill-assignment',
        bot: BOT,
        text: 'Draft the notes',
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: vi.fn(),
      });
      const [provider] = host.scopes.get('memory-skill-assignment')!.skillProviders;
      expect(provider?.name).toBe('botharness-bot-memory');
      expect(
        ((await provider!.list({ cwd: '/project' })) as { name: string; source: string }[]).map(
          (skill) => [skill.name, skill.source],
        ),
      ).toEqual([['release-notes', 'bot-memory']]);
    } finally {
      await adapter.close();
    }
    const orchestratorHost = new FakeAgentHost(
      { kind: 'completed' },
      { onTurn: async () => undefined },
    );
    const orchestrator = createDshBotAgentAdapter({
      agents: orchestratorHost,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => memory,
      ensureWorkspace: () => undefined,
    });
    try {
      await orchestrator.runOrchestrator(reportRun);
      expect(orchestratorHost.scopes.get(reportRun.sessionId)!.skillProviders).toEqual([]);
    } finally {
      await orchestrator.close();
    }
  });

  it.each(['orchestrator', 'assignment', 'model-free-tob'] as const)(
    'refuses %s input if principal access changes while preparing the native Agent',
    async (role) => {
      let active = true;
      const onTurn = vi.fn();
      const host = new FakeAgentHost(
        { kind: 'completed' },
        {
          onAgentCreated: () => {
            active = false;
          },
          onTurn,
        },
      );
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const requireContent = () => {
        if (!active) throw new TeamError('bot-principal-inactive');
      };
      try {
        const result =
          role !== 'assignment'
            ? adapter.runOrchestrator({
                ...reportRun,
                requireContent,
                ...(role === 'model-free-tob'
                  ? {
                      tobCli: true,
                      tobCliTurn: {
                        command: { argv: ['approval-templates'], stdin: '' },
                        signal: new AbortController().signal,
                        complete: vi.fn(),
                      },
                    }
                  : {}),
              })
            : adapter.runAssignment({
                sessionId: 'm7-preparing-assignment',
                bot: BOT,
                text: 'Private input',
                requireContent,
                permission: {
                  grantId: 'grant-1',
                  workspaceId: 'workspace-1',
                  primaryCwd: '/project',
                  mode: 'workspace-write',
                  approval: 'ask',
                  presetRevision: 0,
                },
                report: vi.fn(),
              });
        await expect(result).rejects.toMatchObject({ code: 'bot-principal-inactive' });
        expect(onTurn).not.toHaveBeenCalled();
      } finally {
        await adapter.close();
      }
    },
  );

  it('borrows a native resumed BotHarness Agent and releases only its role registrations', async () => {
    const host = new FakeAgentHost();
    await host.create({
      sessionId: SessionId('orchestrator-ada'),
      meta: { cwd: '/memory/ada' },
    });
    const native = host.get('orchestrator-ada');
    const authorized: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      authorizeBorrow: (agent, role) => authorized.push(role + ':' + agent.session.id),
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: true,
      bot: BOT,
      message: '请核对发布状态',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          title: 'test',
          description: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    expect(authorized).toEqual(['orchestrator:orchestrator-ada']);
    expect(host.resumeOptions).toHaveLength(0);
    expect(
      host.scopes.get('orchestrator-ada')?.tools.some((tool) => tool.name === 'create_assignment'),
    ).toBe(true);
    await adapter.close();
    expect(host.disposed).toEqual([]);
    expect(host.get('orchestrator-ada')).toBe(native);
    expect(
      host.scopes.get('orchestrator-ada')?.tools.some((tool) => tool.name === 'create_assignment'),
    ).toBe(false);
  });

  it('mounts the resolved agent preset inside every agent factory setup', async () => {
    const host = new FakeAgentHost();
    const mounted: Array<{ id: string | undefined; hasTools: boolean }> = [];
    let globalMode = 'deepseekbot';
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      defaultAgentPreset: () => globalMode,
      resolveAgentPresets: () => ({
        mount: async (agentCtx, id) => {
          mounted.push({ id, hasTools: agentCtx.tools !== undefined });
          return undefined;
        },
      }),
      ensureWorkspace: () => undefined,
    });
    globalMode = 'standard';

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: '你好',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      inboundChannelId: 'dm-test',
      inbox: '',
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          title: 'test',
          description: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });

    expect(mounted).toEqual([{ id: 'standard', hasTools: true }]);
    await adapter.close();
  });

  it('resumes a fresh Orchestrator Agent after DSH disposed the cached one', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      hasSession: async (id) => host.sessions.some((session) => session.id === id),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run = (message: string): OrchestratorAgentRun => ({
      sessionId: 'orchestrator-ada',
      resume: true,
      bot: BOT,
      inboundChannelId: 'dm-test',
      inbox: '',
      message,
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async () => undefined as never,
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          title: 'test',
          description: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    try {
      await adapter.runOrchestrator(run('第一条'));
      const dead = host.disposeFromDsh('orchestrator-ada');

      await adapter.runOrchestrator(run('第二条'));

      expect(host.get('orchestrator-ada')).not.toBe(dead);
      expect(host.resumeOptions.map((options) => String(options.resumeSessionId))).toEqual([
        'orchestrator-ada',
      ]);
      const received = host.received.get('orchestrator-ada') ?? [];
      expect(received).toHaveLength(2);
      expect(JSON.stringify(received[1]?.content)).toContain('第二条');
    } finally {
      await adapter.close();
    }
  });

  it('forgets a handle when DSH reports its Agent disposed', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: {
        create: (options) => host.create(options),
        resume: (options) => host.resume(options),
      },
      hasSession: async (id) => host.sessions.some((session) => session.id === id),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run = {
      sessionId: 'assignment-1',
      bot: BOT,
      text: '核对发布状态',
      resume: true,
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report: async (input: { state: string; summary: string }) => ({
        ...input,
        at: BOT.createdAt,
      }),
    } as Parameters<typeof adapter.runAssignment>[0];
    try {
      await adapter.runAssignment(run);
      const dead = host.disposeFromDsh('assignment-1');
      adapter.forgetAgent(dead);

      await adapter.runAssignment(run);

      expect(host.get('assignment-1')).not.toBe(dead);
      expect(host.resumeOptions).toHaveLength(1);
      expect(host.received.get('assignment-1')).toHaveLength(2);
    } finally {
      await adapter.close();
    }
  });

  it('resumes a fresh Assignment Agent after DSH disposed the cached one', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      hasSession: async (id) => host.sessions.some((session) => session.id === id),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run = {
      sessionId: 'assignment-1',
      bot: BOT,
      text: '核对发布状态',
      resume: true,
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report: async (input: { state: string; summary: string }) => ({
        ...input,
        at: BOT.createdAt,
      }),
    } as Parameters<typeof adapter.runAssignment>[0];
    try {
      await adapter.runAssignment(run);
      const dead = host.disposeFromDsh('assignment-1');

      const next = adapter.requestAssignment(run);
      if (next.delivery !== 'followup') throw new Error('Missing followup');
      await next.done;

      expect(host.get('assignment-1')).not.toBe(dead);
      expect(host.received.get('assignment-1')).toHaveLength(2);
    } finally {
      await adapter.close();
    }
  });

  it('releases a replaced Orchestrator handle but keeps a running one', async () => {
    let releaseDuringTurn: Promise<void> | undefined;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onSessionEvent: (session, event) => {
          if (session.id === 'orchestrator-new' && event.type === 'turn/start')
            releaseDuringTurn = adapter.releaseSession!('orchestrator-new');
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run = (sessionId: string): OrchestratorAgentRun => ({
      sessionId,
      resume: false,
      bot: BOT,
      inboundChannelId: 'dm-test',
      inbox: '',
      message: '请核对发布状态',
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async () => undefined as never,
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          title: 'test',
          description: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    try {
      await adapter.runOrchestrator(run('orchestrator-old'));
      await adapter.runOrchestrator(run('orchestrator-new'));
      expect(releaseDuringTurn).toBeDefined();
      await releaseDuringTurn;
      expect(host.disposed).toEqual([]);

      await adapter.releaseSession!('orchestrator-old');
      await adapter.releaseSession!('orchestrator-old');
      await adapter.releaseSession!('never-opened');
      expect(host.disposed).toEqual(['orchestrator-old']);
    } finally {
      await adapter.close();
    }
    expect(host.disposed.sort()).toEqual(['orchestrator-new', 'orchestrator-old']);
  });

  it('runs independent scoped Orchestrator and Assignment roots and owns their handles', async () => {
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        sendMessage: true,
        onSessionEvent: (session, event) => {
          if (session.id === 'orchestrator-ada' && event.type === 'turn/start')
            expect(adapter.steerOrchestrator?.(BOT.slug, '请继续回复当前 Channel')).toBe(true);
        },
      },
    );
    const preparedWorkspaces: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      defaultAgentPreset: 'standard',
      ensureWorkspace: (path) => void preparedWorkspaces.push(path),
    });
    const reports: unknown[] = [];
    const completions: unknown[] = [];
    const sends: unknown[] = [];

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      inboundChannelId: 'dm-test',
      inbox: '',
      message: '请核对发布状态',
      channels: {
        ...groupTools,
        list: () => ({
          outputLimit: 12000,
          channels: [
            {
              id: 'dm-test',
              type: 'dm',
              kind: 'human-dm',
              name: 'Ada',
              members: [{ botId: 'ada', displayName: 'Ada', active: true }],
              humanMembers: [],
            },
          ],
        }),
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
        send: async (input) => {
          sends.push(input);
          return {
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          };
        },
      },
      assignments: {
        create: (input) => {
          expect(input.description).toBe('核对发布状态');
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          title: 'test',
          description: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    await adapter.runAssignment({
      sessionId: 'assignment-1',
      bot: BOT,
      text: '核对发布状态',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      completedTurn: (execution) => void completions.push(execution),
      report: async (input, execution) => {
        expect(execution).toEqual({ turn: 1 });
        reports.push(input);
        return { ...input, at: BOT.createdAt };
      },
    });
    void reports;

    expect(sends).toEqual([
      expect.objectContaining({ channelId: 'dm-test', body: '发布状态已经核对完成。' }),
    ]);
    expect(reports).toEqual([{ state: 'completed', summary: '发布状态正常' }]);
    expect(completions).toEqual([
      {
        turn: 1,
        endSeq: host.sessions
          .find((session) => session.id === 'assignment-1')!
          .snapshotEvents()
          .find((event) => event.type === 'turn/end')!.seq,
      },
    ]);
    expect(host.createOptions).toHaveLength(2);
    expect(host.createOptions.map((options) => options.agentOptions)).toEqual([
      { provider: 'test', model: 'test' },
      { provider: 'test', model: 'test' },
    ]);
    expect(host.createOptions.every((options) => options.parentAgent === undefined)).toBe(true);
    expect(host.createOptions.map((options) => options.meta?.cwd)).toEqual([
      '/memory/ada',
      '/project',
    ]);
    expect(host.createOptions.map((options) => options.meta?.agentPreset)).toEqual([
      'standard',
      'standard',
    ]);
    expect(preparedWorkspaces).toEqual(['/memory/ada']);
    expect(host.scopes.get('orchestrator-ada')?.tools.map((tool) => tool.name)).toEqual(
      ORCHESTRATOR_TOOL_ORDER,
    );
    expect(
      host.scopes
        .get('orchestrator-ada')
        ?.tools.map((tool) => tool.name)
        .filter((name) => isDshGovernedTool(name) && !name.startsWith('secret_')),
    ).toEqual([]);
    const channelSend = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'bot_send_message');
    const rolePrompt = host.scopes.get('orchestrator-ada')?.sections[0]?.text ?? '';
    expect(rolePrompt).toContain('## Reply delivery contract');
    expect(rolePrompt.indexOf('## Reply delivery contract')).toBeLessThan(
      rolePrompt.indexOf('Use three complementary sources'),
    );
    expect(rolePrompt).toContain('Your assistant text is private Session output');
    expect(rolePrompt).toContain('make your first call a short receipt');
    expect(rolePrompt).toContain('report at real milestones');
    expect(rolePrompt).toContain('Never stop with work half done and no status');
    expect(rolePrompt).toContain('If bot_send_message returns notWoken');
    expect(rolePrompt).not.toContain('speak only to move it forward');
    expect(rolePrompt).toContain('Respect requests for silence');
    expect(rolePrompt).toContain('Use the same tool for Group/Bot DM, attachments and external IM');
    expect(rolePrompt).toContain('do not retry uncertain sends blindly');
    expect(rolePrompt).toContain('call ask_secret at once');
    expect(rolePrompt).toContain('never ask them to paste a secret into a Channel');
    expect(rolePrompt.replace(/\{\{(?:provider|model|cwd)\}\}/g, '')).not.toContain('{{');
    expect(channelSend?.description).toContain('Ordinary assistant text is private');
    expect(channelSend?.description).toContain('Ordinary assistant text is private');
    const deliveryPrompt = host.scopes
      .get('orchestrator-ada')
      ?.sections.find((section) => section.name === 'botharness:reply-delivery')?.text;
    expect(deliveryPrompt).toContain(
      'Deliver intended Channel and external IM messages through bot_send_message',
    );
    expect(deliveryPrompt).toContain('纯文本 final 不会发送给用户');
    expect(deliveryPrompt).toContain('If no reply is wanted, remain silent');
    const received = host.received.get('orchestrator-ada')?.[0]?.content;
    expect(received).toHaveLength(3);
    expect(received?.[0]).toEqual({ type: 'text', text: '请核对发布状态' });
    expect(received?.[1]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[Host context]'),
    });
    expect(received?.[2]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[Host reply transport reminder]'),
    });
    expect(host.received.get('assignment-1')?.[0]?.content).toEqual([
      { type: 'text', text: '核对发布状态' },
      { type: 'text', text: expect.stringContaining('[Host Assignment report transport]') },
    ]);
    expect(host.steered.get('orchestrator-ada')?.[0]?.content).toEqual([
      { type: 'text', text: '请继续回复当前 Channel' },
      {
        type: 'text',
        text: expect.stringContaining('[Host reply transport reminder]'),
      },
    ]);
    expect(channelSend?.parameters).toMatchObject({
      properties: { body: expect.any(Object), channel_id: expect.any(Object) },
      required: ['body'],
    });
    const channelReadImage = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'channel_read_image');
    expect(channelReadImage?.parameters).toMatchObject({
      properties: {
        channel_id: expect.any(Object),
        message_id: expect.any(Object),
        hash: expect.any(Object),
        attachment_id: expect.any(Object),
      },
      required: ['message_id'],
    });
    expect(
      channelReadImage?.output.render(
        {},
        {
          channelId: 'group-team',
          messageId: 'message-1',
          hash: 'sha256:abc',
          image: {
            attachmentId: 'sha256:image',
            mediaType: 'image/png',
            bytes: 8,
            width: 1,
            height: 1,
          },
        },
      ),
    ).toMatchObject([{ type: 'text' }, { type: 'image' }]);
    const callFrame = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'call_frame');
    expect(callFrame?.parameters).toMatchObject({ required: ['message_id', 'cell'] });
    expect(
      callFrame?.output.render(
        {},
        { channelId: 'dm-ada', messageId: 'human-1', cell: 2, released: true },
      ),
    ).toEqual([{ type: 'text', text: expect.stringContaining('released') }]);
    expect(
      callFrame?.output.render(
        {},
        {
          channelId: 'dm-ada',
          messageId: 'human-1',
          cell: 2,
          released: false,
          cells: 4,
          source: 'screen',
          image: {
            attachmentId: 'sha256:cell',
            mediaType: 'image/jpeg',
            bytes: 8,
            width: 1920,
            height: 1080,
          },
        },
      ),
    ).toMatchObject([
      { type: 'text', text: expect.stringContaining('Cell 2 of 4') },
      { type: 'image' },
    ]);
    expect(JSON.stringify(channelSend?.parameters)).not.toMatch(
      /"(?:bot_slug|persona_bot|author)"\s*:/,
    );
    const groupAttentionSet = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'group_attention_set');
    expect(groupAttentionSet?.parameters).toMatchObject({ required: ['channel_id', 'mode'] });
    expect(JSON.stringify(groupAttentionSet?.parameters)).not.toMatch(/bot_slug|persona_bot|actor/);
    expect(host.scopes.get('assignment-1')?.tools.map((tool) => tool.name)).toEqual([
      'report_to_orchestrator',
    ]);
    const orchestratorPrompt = host.scopes.get('orchestrator-ada')?.sections[0]?.text ?? '';
    expect(orchestratorPrompt).toContain('Orchestrator');
    expect(orchestratorPrompt).toContain('does not wait');
    expect(orchestratorPrompt).toContain('must not be delegated');
    expect(orchestratorPrompt).toContain('Memory Repository');
    expect(orchestratorPrompt).toContain('frozen for this Session');
    expect(orchestratorPrompt).toContain('SOUL.md');
    expect(
      host.scopes.get('assignment-1')?.sections.map(({ name, order }) => [name, order]),
    ).toEqual([['botharness:assignment-role', 10_350]]);
    const assignmentPrompt = host.scopes.get('assignment-1')?.sections[0]?.text ?? '';
    expect(assignmentPrompt).toContain('Assignment');
    expect(assignmentPrompt).toContain('Never access another workspace or the PersonaBot');
    expect(host.scopes.get('orchestrator-ada')?.restrictions).toEqual([]);
    expect(host.scopes.get('assignment-1')?.restrictions).toEqual([]);
    expect(assignmentPrompt).toContain(
      'when one asks DSH for permission, the approval card appears in the Bot Channel',
    );
    expect(assignmentPrompt).toContain('expects_reply');

    await adapter.close();
    expect(host.disposed.sort()).toEqual(['assignment-1', 'orchestrator-ada']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { AssignmentAgentRun, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import {
  TOB_CLI_TOOL_NAMES,
  ORCHESTRATOR_TOOL_ORDER,
  ASSIGNMENT,
  groupTools,
  reportRun,
} from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it.each([undefined, 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL'])(
    'uses the exact Model Plan route and keeps credential failures repairable: %s',
    async (code) => {
      const host = new FakeAgentHost(
        code === undefined
          ? { kind: 'completed' }
          : {
              kind: 'error',
              error: { code, message: 'selected provider credential unavailable' },
            },
      );
      let available = false;
      const observeTurnFailure = vi.fn();
      const adapter = createDshBotAgentAdapter({
        agents: host,
        hasSession: async () => false,
        observeTurnFailure,
        prepareModelRoute: async () => {
          if (!available) throw new Error('Model route unavailable; select a Model Preset');
        },
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        defaultAgentPreset: 'standard',
        ensureWorkspace: () => undefined,
      });

      const run: OrchestratorAgentRun = {
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: {
          ...BOT,
          preset: 'cordis',
          modelPlan: {
            revision: 1,
            sourcePresetId: 'preset-1',
            sourcePresetName: 'High intelligence',
            orchestrator: {
              provider: 'deepseek',
              model: 'deepseek-reasoner',
              reasoningEffort: 'high',
            },
            assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
            appliedAt: BOT.createdAt,
          },
        },
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
      };

      await expect(adapter.runOrchestrator(run)).rejects.toThrow('select a Model Preset');
      expect(host.createOptions).toHaveLength(0);
      available = true;
      if (code === undefined) await adapter.runOrchestrator({ ...run, resume: true });
      else
        await expect(adapter.runOrchestrator({ ...run, resume: true })).rejects.toThrow(
          'Open PersonaBot Profile',
        );
      expect(host.createOptions).toHaveLength(1);
      expect(host.resumeOptions).toHaveLength(0);
      expect(host.createOptions[0]?.meta?.agentPreset).toBe('cordis');
      expect(host.createOptions[0]?.agentOptions).toEqual({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        reasoningEffort: 'high',
      });
      expect(observeTurnFailure.mock.calls).toEqual(code === undefined ? [] : [['deepseek', code]]);
      await adapter.close();
    },
  );

  it('keeps a running Turn on its selected route and uses an edited snapshot on the next Turn', async () => {
    const high = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const initialPlan = {
      revision: 1,
      sourcePresetId: 'high',
      sourcePresetName: 'High',
      orchestrator: high,
      assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      appliedAt: BOT.createdAt,
    };
    let currentPlan = initialPlan;
    let releaseSend: () => void = () => undefined;
    let reachedSend: () => void = () => undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const sendStarted = new Promise<void>((resolve) => {
      reachedSend = resolve;
    });
    let firstSend = true;
    const host = new FakeAgentHost({ kind: 'completed' }, { sendMessage: true });
    const defaultModel = { currentSelection: () => ({ provider: 'test', model: 'test' }) };
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel,
      resolveModelPlan: () => currentPlan,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run: OrchestratorAgentRun = {
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: { ...BOT, modelPlan: initialPlan },
      message: 'First turn',
      inbox: '',
      inboundChannelId: 'dm-test',
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
        requestGrant: async () => undefined as never,
        send: async (input) => {
          if (firstSend) {
            firstSend = false;
            reachedSend();
            await sendGate;
          }
          return {
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          };
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
    };
    try {
      const firstTurn = adapter.runOrchestrator(run);
      await sendStarted;
      expect(await host.selectedModel(run.sessionId)).toMatchObject(high);
      currentPlan = { ...initialPlan, revision: 2, orchestrator: low };
      adapter.captureNativeOrchestratorModel?.(run.sessionId, run.bot);
      expect(await host.selectedModel(run.sessionId)).toMatchObject(high);
      releaseSend();
      await firstTurn;

      adapter.captureNativeOrchestratorModel?.(run.sessionId, run.bot);
      expect(await host.selectedModel(run.sessionId)).toMatchObject(low);

      await adapter.runOrchestrator({ ...run, resume: true, message: 'Next turn' });
      expect(await host.selectedModel(run.sessionId)).toMatchObject(low);
      expect(defaultModel.currentSelection()).toEqual({ provider: 'test', model: 'test' });
    } finally {
      releaseSend();
      await adapter.close();
    }
  });

  it('runs a Bot without a Model Plan on the fallback route its default group chose', async () => {
    const fallback = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
    let chosen: typeof fallback | undefined;
    const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'flash' }) },
      orchestratorRoute: () => chosen,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      await adapter.runOrchestrator(reportRun);
      expect(await host.selectedModel(reportRun.sessionId)).toMatchObject({
        provider: 'deepseek-official',
      });
      chosen = fallback;
      await adapter.runOrchestrator({ ...reportRun, resume: true });
      expect(await host.selectedModel(reportRun.sessionId)).toMatchObject(fallback);
    } finally {
      await adapter.close();
    }
  });

  it.each([false, true])(
    'keeps tool and prompt registration order as IM connectivity changes (Tob CLI %s)',
    async (tobCli) => {
      const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      let connected = false;
      const run: OrchestratorAgentRun = {
        ...reportRun,
        tobCli,
        externalMessaging: {
          connected: () => connected,
        } as NonNullable<OrchestratorAgentRun['externalMessaging']>,
      };
      const baseTools = ORCHESTRATOR_TOOL_ORDER.filter(
        (name) => !tobCli || !TOB_CLI_TOOL_NAMES.includes(name),
      );
      const baseSections = [
        ['botharness:orchestrator-role', 10_350],
        ...(tobCli ? [['botharness:tob-cli', 10_351]] : []),
        ['botharness:reply-delivery', 10_450],
        ['botharness:genui-authoring', 10_451],
      ];
      const bridgeToolNames = [
        'bridge_sender_permissions',
        'bridge_directory',
        'bridge_targets',
        'bridge_reachable_groups',
        'bridge_outbox',
        'bridge_read',
        'bridge_share',
        'bridge_group_policy_list',
        'bridge_group_policy_set',
        'bridge_thread_policy_list',
        'bridge_thread_policy_set',
        'bridge_context',
        'bridge_attachment_save',
      ];
      const expectRegistration = () => {
        const scope = host.scopes.get(run.sessionId)!;
        expect(scope.tools.map((tool) => tool.name)).toEqual(
          connected ? [...baseTools, ...bridgeToolNames] : baseTools,
        );
        expect(scope.sections.map(({ name, order }) => [name, order])).toEqual(
          connected ? [...baseSections, ['botharness:external-im', 10_351]] : baseSections,
        );
      };
      try {
        await adapter.runOrchestrator(run);
        expectRegistration();

        connected = true;
        await adapter.runOrchestrator({ ...run, resume: true });
        expectRegistration();

        await adapter.runOrchestrator({ ...run, resume: true });
        expectRegistration();

        connected = false;
        await adapter.runOrchestrator({ ...run, resume: true });
        expectRegistration();
      } finally {
        await adapter.close();
      }
    },
  );

  it('passes the persisted Assignment route to its DSH Agent without changing the Bot default', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const selected: AssignmentAgentRun = {
      sessionId: 'assignment-selected',
      bot: {
        ...BOT,
        modelPlan: {
          revision: 2,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
          assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
          assignmentModels: [
            { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
            { provider: 'deepseek', model: 'flash', allowedEfforts: ['low'], defaultEffort: 'low' },
          ],
          appliedAt: BOT.createdAt,
        },
      },
      text: 'Inspect',
      modelRoute: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report: async (input) => ({ ...input, at: BOT.createdAt }),
    };
    await adapter.runAssignment(selected);
    expect(host.createOptions[0]?.agentOptions).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    expect(await host.selectedModel('assignment-selected')).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    const delivery = adapter.requestAssignment({
      ...selected,
      text: 'Continue on Pro',
      resume: true,
      modelRoute: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
    });
    if (delivery.delivery === 'followup') await delivery.done;
    expect(await host.selectedModel('assignment-selected')).toEqual({
      provider: 'deepseek',
      model: 'pro',
      reasoningEffort: 'off',
    });
    await adapter.close();
  });

  it.each([undefined, { provider: 'fixed', model: 'assignment' }])(
    'keeps a retained Assignment route or global inheritance after an Orchestrator-only change: %j',
    async (retained) => {
      const host = new FakeAgentHost();
      let globalRoute = { provider: 'global', model: 'before' };
      let plan = {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { provider: 'chat', model: 'one' },
        appliedAt: BOT.createdAt,
      };
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => globalRoute },
        resolveModelPlan: () => plan,
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const run: AssignmentAgentRun = {
        sessionId: 'inherited-assignment',
        bot: BOT,
        text: 'Inspect',
        ...(retained === undefined ? {} : { modelRoute: retained }),
        permission: {
          grantId: 'grant-1',
          workspaceId: 'workspace-1',
          primaryCwd: '/project',
          mode: 'workspace-write',
          approval: 'ask',
          presetRevision: 0,
        },
        report: async (input) => ({ ...input, at: BOT.createdAt }),
      };
      await adapter.runAssignment(run);
      expect(await host.selectedModel(run.sessionId)).toEqual(retained ?? globalRoute);
      plan = { ...plan, revision: 2, orchestrator: { provider: 'chat', model: 'two' } };
      globalRoute = { provider: 'global', model: 'after' };
      const next = adapter.requestAssignment({ ...run, resume: true, text: 'Continue' });
      if (next.delivery === 'followup') await next.done;
      expect(await host.selectedModel(run.sessionId)).toEqual(retained ?? globalRoute);
      await adapter.close();
    },
  );

  it('uses a distinct prompt for a dangerous Assignment snapshot', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    await adapter.runAssignment({
      sessionId: 'assignment-danger',
      bot: BOT,
      text: 'Run pwd',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'danger-full-access',
        approval: 'never',
        presetRevision: 1,
      },
      report: async (input) => ({ ...input, at: BOT.createdAt }),
    });
    const prompt = host.scopes.get('assignment-danger')?.sections[0]?.text ?? '';
    expect(prompt).toContain('The Human explicitly enabled dangerous full access');
    expect(prompt).toContain('do not ask for each call');
    expect(prompt).not.toContain('require Human approval');
    await adapter.close();
  });
});

import {
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { expect, it } from 'vitest';
import { createDshBotAgentAdapter } from '../src/agent-adapter.js';
import { installNativeSubagentWake } from '../src/runtime/native-subagent-wake.js';
import { API, nativeRuntime } from './fixtures/routing-group-engine.js';
import { createTempRoot } from './helpers.js';
import { reportRun } from './support/dsh-bot-agent-adapter.js';

class CapturingModel extends LlmAdapter {
  firstRequest: GenerateOptions | undefined;

  override async resolveModel(provider: string, id: string) {
    return { provider, id, name: id, context: { contextWindow: 200_000 } };
  }

  override async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.firstRequest ??= options;
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Done.' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

it.each(['bare', 'with preset'] as const)(
  'keeps the Bot prompt and tools on the first native wake after restarting a long %s Session',
  async (composition) => {
    const cwd = createTempRoot('orchestrator-resume-');
    const sessionId = SessionId(reportRun.sessionId);
    const presets = new WeakMap<Context, string>();
    const mountPreset = async (ctx: Context, id = 'fixture') => {
      expect(presets.has(ctx)).toBe(false);
      presets.set(ctx, id);
      ctx.systemPrompt.section({
        name: 'fixture-preset',
        order: 0,
        text: 'Preset prompt for the resumed Bot.',
      });
    };
    const makeAdapter = ({ agents }: Awaited<ReturnType<typeof nativeRuntime>>) =>
      createDshBotAgentAdapter({
        agents,
        defaultModel: { currentSelection: () => API },
        defaultAgentPreset: 'fixture',
        orchestratorCwd: () => cwd,
        resolveAgentPresets: () => ({
          mount: mountPreset,
          composedPreset: (ctx) => presets.get(ctx),
        }),
      });
    const promptConfig = { includeHarnessIdentity: false };
    const fresh = await nativeRuntime(new CapturingModel(), undefined, promptConfig);
    const freshAdapter = makeAdapter(fresh);
    await freshAdapter.runOrchestrator(reportRun);
    for (let index = 1; index < 200; index++) {
      await freshAdapter.runOrchestrator({ ...reportRun, resume: true, message: `Turn ${index}` });
    }
    await freshAdapter.close();
    await fresh.ctx.fiber.dispose();
    const stored = fresh.dsh.stored.get(sessionId);
    if (stored === undefined) throw new Error('Missing stored Orchestrator Session');
    expect(stored.events.length).toBeGreaterThan(1_200);
    const initialHeader = stored.events.find((event) => event.type === 'request/header');
    const initialPrompt = stored.events.find((event) => event.type === 'system/message');
    expect(initialHeader?.data.header.tools?.some((tool) => tool.name === 'bot_send_message')).toBe(
      true,
    );
    expect(initialPrompt?.data.message.content.length).toBeGreaterThan(0);
    const resumedAt = stored.events.length;

    const model = new CapturingModel();
    const restarted = await nativeRuntime(model, undefined, promptConfig);
    restarted.dsh.stored.set(sessionId, stored);
    restarted.ctx.tools.setExecutor({
      describe: () => ({ schemas: [] }),
      execute: async () => {
        throw new Error('Missing scoped executor');
      },
    });
    const adapter = makeAdapter(restarted);
    restarted.ctx.on(
      'agent/pre-step',
      async (_input, next) => {
        const decision = await next();
        return decision.kind === 'enter' ? { ...decision, startsRequestSeries: true } : decision;
      },
      { global: true },
    );
    let run: Promise<void> | undefined;
    installNativeSubagentWake(
      restarted.ctx,
      {
        async prepareNativeOrchestratorStep(id, senders) {
          expect(id).toBe(sessionId);
          expect(senders).toEqual(['child']);
          return new Promise<boolean>((resolve, reject) => {
            run = adapter.runOrchestrator({
              ...reportRun,
              resume: true,
              message: '',
              acceptNativeInput: () => {
                resolve(true);
                return true;
              },
            });
            void run.catch(reject);
          });
        },
      },
      (agent, signal) =>
        adapter.attachResumedOrchestrator(agent, { ...reportRun, resume: true }, signal),
    );
    const native = await restarted.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: API,
      ...(composition === 'with preset' ? { setup: (ctx: Context) => mountPreset(ctx) } : {}),
    });
    try {
      native.agent.followup(
        createUserMessage({
          content: [{ type: 'text', text: 'Child report' }],
          source: { kind: 'agent-message', form: 'relay', senderSessionId: SessionId('child') },
        }),
      );
      await native.agent.whenIdle();
      await run;
      const events = stored.events.slice(resumedAt);
      const header = events.find((event) => event.type === 'request/header');
      const prompt = events.findLast((event) => event.type === 'system/message') ?? initialPrompt;
      const retainedPrompt = model.firstRequest?.messages.find(
        (message) => message.role === 'system',
      );
      expect({
        reason: header?.data.reason,
        series: header?.data.startsSeries,
        hasTools: Object.hasOwn(header?.data.header ?? {}, 'tools'),
        toolCount: header?.data.header.tools?.length ?? 0,
        systemBlocks: prompt?.data.message.content.length ?? 0,
        retainedBotPrompt: retainedPrompt?.content.some(
          (block) =>
            block.type === 'text' &&
            block.text.includes('You are the Orchestrator for one PersonaBot'),
        ),
        removals: events.flatMap((event) =>
          event.type === 'developer/message'
            ? event.data.message.content.filter((block) => block.type === 'tool-removal')
            : [],
        ).length,
      }).toEqual({
        reason: 'resume',
        series: true,
        hasTools: true,
        toolCount: initialHeader?.data.header.tools?.length,
        systemBlocks: initialPrompt?.data.message.content.length,
        retainedBotPrompt: true,
        removals: 0,
      });
      expect(header?.data.header.tools).toEqual(initialHeader?.data.header.tools);
      expect(retainedPrompt?.content).toEqual(initialPrompt?.data.message.content);
    } finally {
      await adapter.close();
      await native.dispose();
    }
  },
);
import type { Context } from '@deepseek-ai/cordis';

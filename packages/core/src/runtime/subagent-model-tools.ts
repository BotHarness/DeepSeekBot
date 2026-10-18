import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import type { JobOutcome } from '@deepseek-ai/dsh-jobs';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent';
import type { SubagentActivationSpec } from '@deepseek-ai/dsh-subagent';
import { defineTool } from '@deepseek-ai/dsh-tools';

import {
  assignmentModelsOf,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import { resolveSubagentRoute } from '../models/subagent-route.js';
import { startCallerActivation, startParentActivation, type CallerRun } from './subagent-compat.js';

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    subagent: 'subagent';
  }
}

type DelegationProvider = 'spawn' | 'fork';

function agentOptions(parent: AgentOptions, route: ModelRoute): AgentOptions {
  const { reasoningEffort: _previousEffort, ...rest } = parent;
  return {
    ...rest,
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
  };
}

async function settleJob(run: CallerRun): Promise<JobOutcome> {
  let outcome: JobOutcome;
  try {
    const result = await run.result;
    outcome =
      result.stopReason === 'completed'
        ? {
            status: 'completed',
            result: result.output
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join(''),
          }
        : result.stopReason === 'aborted' && result.diagnostic === undefined
          ? { status: 'killed' }
          : {
              status: 'failed',
              detail: `${result.stopReason}${result.diagnostic === undefined ? '' : `; diagnostic: ${result.diagnostic}`}`,
            };
  } catch (error) {
    outcome = { status: 'failed', detail: String(error) };
  }
  try {
    await run.dispose();
  } catch (error) {
    return {
      status: 'failed',
      detail: `${outcome.detail === undefined ? '' : `${outcome.detail}; `}dispose failed: ${String(error)}`,
    };
  }
  return outcome;
}

async function collect(run: CallerRun): Promise<string> {
  const [result] = await Promise.allSettled([run.result]);
  const [disposal] = await Promise.allSettled([run.dispose()]);
  if (result.status === 'rejected') {
    if (disposal.status === 'rejected')
      throw new AggregateError(
        [result.reason, disposal.reason],
        'Subagent result and disposal failed',
      );
    throw result.reason;
  }
  if (disposal.status === 'rejected') throw disposal.reason;
  if (result.value.stopReason !== 'completed') {
    throw new Error(
      `Subagent ${run.childId} ended ${result.value.stopReason}${result.value.diagnostic === undefined ? '' : `: ${result.value.diagnostic}`}`,
    );
  }
  const output = result.value.output
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return `Subagent ${run.childId} completed.${output.length === 0 ? '' : `\n${output}`}`;
}

function installOne(
  ctx: Context,
  provider: DelegationProvider,
  resolvePlan: () => PersonaBotModelPlan | undefined,
): void {
  const name = provider === 'spawn' ? 'bot_subagent' : 'bot_subagent_fork';
  ctx.tools.register(
    defineTool({
      name,
      description:
        provider === 'spawn'
          ? 'Delegate an independent task to a DSH Subagent. The Bot current Assignment model set controls its route. Omit model fields to inherit an allowed parent route or use the current Assignment default. Background is the default; use send_message to continue its Session.'
          : 'Delegate a task to a DSH Subagent seeded with completed parent turns. The Bot current Assignment model set controls its route. Foreground is the default.',
      parameters: {
        description: { type: 'string', required: true, description: 'Short task label.' },
        prompt: { type: 'string', required: true, description: 'Task for the child Agent.' },
        provider: {
          type: 'string',
          description: 'Optional allowed LLM provider id; specify with model.',
        },
        model: { type: 'string', description: 'Optional allowed model id; specify with provider.' },
        reasoning_effort: { type: 'string', description: 'Optional allowed reasoning effort.' },
        run_in_background: {
          type: 'boolean',
          description:
            provider === 'spawn'
              ? 'Defaults to true; set false to wait for the result.'
              : 'Defaults to false; set true to collect the result as a DSH Job.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent = exec.agent;
        if (parent === undefined) throw new Error(`${name} requires a calling Agent`);
        const subagents = ctx.get('subagents');
        if (subagents === undefined) throw new Error('DSH Subagent service is unavailable');
        const decision = resolveSubagentRoute(
          resolvePlan(),
          parentAgentOptionsForDelegation(parent),
          args,
        );
        const options = agentOptions(parentAgentOptionsForDelegation(parent), decision.route);
        const llm = ctx.get('llm');
        if (llm === undefined) throw new Error('DSH LLM service is unavailable');
        await llm.resolveCallConfig(
          {
            provider: decision.route.provider,
            model: decision.route.model,
            ...(decision.route.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: ReasoningEffortId(decision.route.reasoningEffort) }),
          },
          exec.signal,
        );
        exec.signal.throwIfAborted();
        const maxDepth = subagents.resolveMaxDepth();
        const request: SubagentActivationSpec['request'] = {
          parent,
          prompt: [{ type: 'text', text: args.prompt }],
          agentOptions: options,
          ...(maxDepth === undefined ? {} : { maxDepth }),
        };
        const notice = decision.notice === undefined ? '' : `${decision.notice}\n`;
        const background = args.run_in_background ?? provider === 'spawn';
        if (background && provider === 'spawn') {
          const started = await startParentActivation(
            subagents,
            { provider, label: args.description, request, signal: exec.signal },
            (childId, error) =>
              ctx.logger.warn(
                `botharness: subagent activation ${childId} failed: ${String(error)}`,
              ),
          );
          return `${notice}Started Subagent ${started.childId} on ${decision.route.provider}/${decision.route.model}.`;
        }
        if (background) {
          const jobs = ctx.get('jobs');
          if (jobs === undefined) throw new Error('DSH background Jobs service is unavailable');
          const jobId = jobs.start({
            kind: 'subagent',
            label: args.description,
            owner: parent.id,
            run: () => {
              const controller = new AbortController();
              return {
                cancel: (reason) => controller.abort(reason ?? 'Subagent Job cancelled'),
                done: (async () => {
                  try {
                    return await settleJob(
                      await startCallerActivation(subagents, {
                        provider,
                        request,
                        label: args.description,
                        signal: controller.signal,
                      }),
                    );
                  } catch (error) {
                    return controller.signal.aborted
                      ? { status: 'killed' as const }
                      : { status: 'failed' as const, detail: String(error) };
                  }
                })(),
              };
            },
          });
          return `${notice}Started background Subagent Job ${jobId} on ${decision.route.provider}/${decision.route.model}.`;
        }
        const run = await startCallerActivation(subagents, {
          provider,
          request,
          label: args.description,
          signal: exec.signal,
        });
        return notice + (await collect(run));
      },
    }),
  );
}

export function installBotSubagentModelTools(
  ctx: Context,
  agent: Agent,
  resolvePlan: () => PersonaBotModelPlan | undefined,
): void {
  if (ctx.get('subagents') === undefined) return;
  ctx.tools.guard((execution) =>
    execution.name === 'subagent' ||
    execution.name === 'subagent_fork' ||
    execution.name === 'list_subagent_models'
      ? 'Use the Bot-scoped Subagent tools for this PersonaBot'
      : undefined,
  );
  ctx.systemPrompt.section({
    name: 'botharness:subagent-model-route',
    order: 10_360,
    text: 'For DSH Subagents in this PersonaBot, use bot_subagent or bot_subagent_fork. Call list_bot_subagent_models before an explicit model choice. The current Human-selected Assignment model set is checked when each child starts.',
  });
  installOne(ctx, 'spawn', resolvePlan);
  installOne(ctx, 'fork', resolvePlan);
  ctx.tools.register(
    defineTool({
      name: 'list_bot_subagent_models',
      description: 'List this PersonaBot current Assignment model choices for DSH Subagents.',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => {
        const plan = resolvePlan();
        if (plan?.assignmentDefault === undefined)
          return 'No Model Preset is applied; Subagents inherit the parent route.';
        return JSON.stringify({
          default: plan.assignmentDefault,
          allowed: assignmentModelsOf(plan),
          parentSession: agent.session.id,
        });
      },
    }),
  );
}

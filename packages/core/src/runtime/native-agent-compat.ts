import type { Context } from '@deepseek-ai/cordis';
import { installModelSelection, type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent';
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';

const agentExecutors = new WeakMap<Agent, Promise<void>>();

export async function installAgentNativeTools(ctx: Context, agent: Agent): Promise<() => void> {
  if (typeof ctx.tools.setExecutor !== 'function') return installNativeTools(ctx);
  let installing = agentExecutors.get(agent);
  if (installing === undefined) {
    installing = installNativeTools(ctx).then(() => {
      ctx.effect(
        () => () => {
          agentExecutors.delete(agent);
        },
        'botharness: Agent native executor lifetime',
      );
    });
    agentExecutors.set(agent, installing);
    installing.catch(() => {
      agentExecutors.delete(agent);
    });
  }
  await installing;
  return () => undefined;
}

export async function installNativeTools(ctx: Context, exposeTools = true): Promise<() => void> {
  if (typeof ctx.tools.setExecutor === 'function') {
    const { NativeToolExecutor } = await import('@deepseek-ai/dsh-tool-executor-native');
    const executor = new NativeToolExecutor(ctx);
    return ctx.tools.setExecutor(
      exposeTools
        ? executor
        : {
            describe: (tools) => ({ schemas: [], knownNames: tools.map((tool) => tool.name) }),
            execute: (input) => executor.execute(input),
          },
    );
  }
  const legacy = ctx.tools as unknown as { presentAs(mode: 'native'): () => void };
  return legacy.presentAs('native');
}

export interface DirectNativeCall {
  callId: ToolCallId;
  name: string;
  arguments: unknown;
  agent?: Agent;
  signal: AbortSignal;
}

export async function executeNativeTool(
  ctx: Context,
  input: DirectNativeCall,
): Promise<ToolExecutionResult> {
  if (typeof ctx.tools.setExecutor !== 'function') {
    const legacy = ctx.tools as unknown as {
      execute(input: DirectNativeCall): Promise<ToolExecutionResult>;
    };
    return legacy.execute(input);
  }
  const batch = await ctx.tools.execute({
    calls: [
      {
        type: 'tool-call',
        id: input.callId,
        name: input.name,
        arguments: JSON.stringify(input.arguments),
      },
    ],
    ...(input.agent === undefined ? {} : { agent: input.agent }),
    signal: input.signal,
  });
  if (batch.results.length !== 1 || batch.results[0]?.callId !== input.callId)
    throw new Error('Native tool executor returned an uncorrelated direct-call result');
  return batch.results[0].result;
}

export interface NativeModelSelection {
  current: ModelSelection | undefined;
  assembled: ModelSelection | undefined;
}

export function installNativeModelSelection(
  ctx: Context,
  agent: Agent,
  selection: NativeModelSelection,
): () => void {
  if (typeof agent.model?.select === 'function') {
    if (selection.current !== undefined) agent.model.select(selection.current);
    return installModelSelection(ctx);
  }
  const installLegacy = installModelSelection as unknown as (
    ctx: Context,
    selection: NativeModelSelection,
  ) => () => void;
  return installLegacy(ctx, selection);
}

export function selectNativeModel(
  agent: Agent | undefined,
  selection: ModelSelection | undefined,
): void {
  if (selection !== undefined && typeof agent?.model?.select === 'function')
    agent.model.select(selection);
}

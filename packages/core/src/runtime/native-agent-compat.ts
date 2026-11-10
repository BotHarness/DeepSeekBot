import type { Context } from '@deepseek-ai/cordis';
import { installModelSelection, type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent';
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { installedDshVersion } from '../telemetry/service.js';

export const HOST_INCOMPATIBLE = 'HOST_INCOMPATIBLE';

export class HostIncompatibleError extends Error {
  override readonly name = 'HostIncompatibleError';
  readonly code = HOST_INCOMPATIBLE;

  constructor(
    readonly capability: string,
    readonly dshVersion: string | undefined,
    cause?: unknown,
  ) {
    super(
      `${HOST_INCOMPATIBLE}: This Tobs version does not support DSH ${dshVersion ?? '(unknown version)'}: ${capability} is unavailable. Update Tobs, then retry.${cause === undefined ? '' : ` Original error: ${errorText(cause)}`}`,
      cause === undefined ? undefined : { cause },
    );
  }
}

export type HostCapabilityState = 'current' | 'legacy' | 'missing';

export interface HostCapabilityReport {
  toolPresentation: HostCapabilityState;
  toolExecution: HostCapabilityState;
}

interface HostTools {
  setExecutor?: unknown;
  presentAs?: unknown;
  execute?: unknown;
}

interface HostLogger {
  warn?: (message: string) => void;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    .replace(/\s+/gu, ' ')
    .slice(0, 300);
}

function hostTools(ctx: Context): HostTools {
  const tools: unknown = Reflect.get(ctx, 'tools');
  return typeof tools === 'object' && tools !== null ? (tools as HostTools) : {};
}

function hostLogger(ctx: Context): HostLogger | undefined {
  const logger: unknown = Reflect.get(ctx, 'logger');
  return (typeof logger === 'object' && logger !== null) || typeof logger === 'function'
    ? (logger as HostLogger)
    : undefined;
}

function isShapeMismatch(error: unknown): boolean {
  return error instanceof TypeError;
}

export function probeHostCapabilities(ctx: Context): HostCapabilityReport {
  const tools = hostTools(ctx);
  const executor = typeof tools.setExecutor === 'function';
  const execute = typeof tools.execute === 'function';
  return {
    toolPresentation: executor
      ? 'current'
      : typeof tools.presentAs === 'function'
        ? 'legacy'
        : 'missing',
    toolExecution: !execute ? 'missing' : executor ? 'current' : 'legacy',
  };
}

export function degradeHostCapability(
  ctx: Context,
  capability: string,
  error?: unknown,
): () => void {
  const version = installedDshVersion();
  hostLogger(ctx)?.warn?.(
    `botharness.host_capability.degraded capability=${capability} dsh=${version ?? 'unknown'}${error === undefined ? ' reason=missing' : ` error=${JSON.stringify(errorText(error))}`}`,
  );
  return () => undefined;
}

export function requireHostCapability(capability: string, cause?: unknown): never {
  throw new HostIncompatibleError(capability, installedDshVersion(), cause);
}

const agentExecutors = new WeakMap<Agent, Promise<void>>();

export async function installAgentNativeTools(ctx: Context, agent: Agent): Promise<() => void> {
  if (probeHostCapabilities(ctx).toolPresentation !== 'current') return installNativeTools(ctx);
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
  const presentation = probeHostCapabilities(ctx).toolPresentation;
  if (presentation === 'current') {
    const executor = await nativeExecutor(ctx);
    return ctx.tools.setExecutor(
      exposeTools
        ? executor
        : {
            describe: (tools) => ({ schemas: [], knownNames: tools.map((tool) => tool.name) }),
            execute: (input) => executor.execute(input),
          },
    );
  }
  if (presentation === 'missing') return degradeHostCapability(ctx, 'tools.presentAs');
  const legacy = hostTools(ctx) as { presentAs(mode: 'native'): unknown };
  try {
    const dispose = legacy.presentAs('native');
    return typeof dispose === 'function'
      ? (dispose as () => void)
      : degradeHostCapability(ctx, 'tools.presentAs disposer');
  } catch (error) {
    if (!isShapeMismatch(error)) throw error;
    return degradeHostCapability(ctx, 'tools.presentAs', error);
  }
}

async function nativeExecutor(
  ctx: Context,
): Promise<
  InstanceType<typeof import('@deepseek-ai/dsh-tool-executor-native').NativeToolExecutor>
> {
  try {
    const { NativeToolExecutor } = await import('@deepseek-ai/dsh-tool-executor-native');
    return new NativeToolExecutor(ctx);
  } catch (error) {
    return requireHostCapability('the native tool executor', error);
  }
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
  const execution = probeHostCapabilities(ctx).toolExecution;
  if (execution === 'missing') return requireHostCapability('tools.execute');
  if (execution === 'legacy') {
    const legacy = hostTools(ctx) as {
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
    return optionalDisposer(ctx, 'model selection', () => installModelSelection(ctx));
  }
  const installLegacy: (ctx: Context, selection: NativeModelSelection) => unknown =
    installModelSelection;
  return optionalDisposer(ctx, 'legacy model selection', () => installLegacy(ctx, selection));
}

function optionalDisposer(ctx: Context, capability: string, install: () => unknown): () => void {
  try {
    const dispose = install();
    return typeof dispose === 'function'
      ? (dispose as () => void)
      : degradeHostCapability(ctx, `${capability} disposer`);
  } catch (error) {
    if (!isShapeMismatch(error)) throw error;
    return degradeHostCapability(ctx, capability, error);
  }
}

export function selectNativeModel(
  agent: Agent | undefined,
  selection: ModelSelection | undefined,
): void {
  if (selection !== undefined && typeof agent?.model?.select === 'function')
    agent.model.select(selection);
}

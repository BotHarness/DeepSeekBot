import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import type { ShellExecutor } from '@deepseek-ai/dsh-shell';
import * as fileTools from '@deepseek-ai/dsh-tool-fs';
import * as bashTools from '@deepseek-ai/dsh-tool-bash';
import * as pwshTools from '@deepseek-ai/dsh-tool-pwsh';
import type { DshAgentPresetHost } from '../runtime/dsh-bot-agent-adapter.js';
import { NATIVE_FILE_TOOL_NAMES } from './grant-native-tools.js';

type Policy = ReturnType<SandboxPolicyService['resolve']>;

const NATIVE_SHELL_TOOLS = { bash: bashTools, pwsh: pwshTools } as const;
type NativeShellToolName = keyof typeof NATIVE_SHELL_TOOLS;

function presetShells(agentCtx: Context, agent: Agent): NativeShellToolName[] {
  const tools = agentCtx.get('tools') as
    | { schemas(agent: Agent): Array<{ name: string }> }
    | undefined;
  const visible = new Set((tools?.schemas(agent) ?? []).map((tool) => tool.name));
  return (Object.keys(NATIVE_SHELL_TOOLS) as NativeShellToolName[]).filter((name) =>
    visible.has(name),
  );
}

export async function installOrchestratorFileTools(
  agentCtx: Context,
  agent: Agent,
  presets: DshAgentPresetHost | undefined,
  rootFor: (name: string, args: unknown) => string,
  shellFor?: (ctx: Context, shell: ShellExecutor) => ShellExecutor,
): Promise<() => Promise<void>> {
  const base = agentCtx.get('sandboxPolicy');
  const fs = presets?.serviceFor?.(agent, 'fs') ?? agentCtx.get('fs');
  const shell = (presets?.serviceFor?.(agent, 'shell') ?? agentCtx.get('shell')) as
    | ShellExecutor
    | undefined;
  if (base === undefined || fs === undefined || shell === undefined)
    throw new Error('Orchestrator native filesystem, Shell and Policy Providers are required');
  const shells = presetShells(agentCtx, agent);
  const callPolicy = new AsyncLocalStorage<Policy>();
  const scoped = agentCtx.isolate('sandboxPolicy').isolate('fs').isolate('shell');
  const fiber = scoped.plugin({
    name: 'botharness-orchestrator-file-tools',
    apply(ctx: Context) {
      ctx.provide('fs', fs);
      if (shellFor === undefined) ctx.provide('shell', shell);
      else shellFor(ctx, shell);
      ctx.provide('sandboxPolicy', {
        defaultMode: base.defaultMode,
        workspaceRoot: base.workspaceRoot,
        overrideOf: (session: Parameters<SandboxPolicyService['overrideOf']>[0]) =>
          base.overrideOf(session),
        resolve(request: Parameters<SandboxPolicyService['resolve']>[0]) {
          const policy = base.resolve(request);
          const current = callPolicy.getStore();
          return current === undefined || request?.session !== agent.session
            ? policy
            : { ...policy, workspaceRoot: current.workspaceRoot };
        },
      });
      ctx.on('tools/execute', (execution, next) => {
        if (
          execution.agent !== agent ||
          (!(shells as string[]).includes(execution.name) &&
            !NATIVE_FILE_TOOL_NAMES.has(execution.name))
        )
          return next();
        if (base.resolve({ session: agent.session }).mode === 'danger-full-access') return next();
        const workspaceRoot = rootFor(execution.name, execution.arguments);
        return callPolicy.run({ ...base.resolve({ session: agent.session }), workspaceRoot }, next);
      });
    },
  });
  try {
    await fiber.await();
    const files = fiber.ctx.plugin(fileTools, {});
    const shellFibers = shells.map((name) =>
      fiber.ctx.plugin(NATIVE_SHELL_TOOLS[name], {
        enableRunInBackground: false,
        promoteOnTimeout: false,
      }),
    );
    await files.await();
    for (const shellFiber of shellFibers) await shellFiber.await();
    if (files.state !== 2 || shellFibers.some((shellFiber) => shellFiber.state !== 2))
      throw new Error('Orchestrator native Tools failed to activate');
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
  return () => fiber.dispose();
}

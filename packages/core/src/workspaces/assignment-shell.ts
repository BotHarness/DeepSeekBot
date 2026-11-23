import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ShellExecutor } from '@deepseek-ai/dsh-shell';
import * as bashTools from '@deepseek-ai/dsh-tool-bash';
import * as pwshTools from '@deepseek-ai/dsh-tool-pwsh';
import type { DshAgentPresetHost } from '../runtime/dsh-bot-agent-adapter.js';
import { ACTIVE_FIBER_STATE } from '../runtime/cordis-fiber-state.js';

const NATIVE_SHELL_TOOLS = { bash: bashTools, pwsh: pwshTools } as const;
type NativeShellToolName = keyof typeof NATIVE_SHELL_TOOLS;

export async function installAssignmentShell(
  agentCtx: Context,
  agent: Agent,
  presets: DshAgentPresetHost | undefined,
  shellFor: (ctx: Context, shell: ShellExecutor) => ShellExecutor,
): Promise<(() => Promise<void>) | undefined> {
  const shell = (presets?.serviceFor?.(agent, 'shell') ?? agentCtx.get('shell')) as
    | ShellExecutor
    | undefined;
  const tools = agentCtx.get('tools') as
    | { schemas(agent: Agent): Array<{ name: string }> }
    | undefined;
  const visible = new Set((tools?.schemas(agent) ?? []).map((tool) => tool.name));
  const shells = (Object.keys(NATIVE_SHELL_TOOLS) as NativeShellToolName[]).filter((name) =>
    visible.has(name),
  );
  if (shell === undefined || shells.length === 0) return undefined;
  const fiber = agentCtx.isolate('shell').plugin({
    name: 'botharness-assignment-shell',
    apply(ctx: Context) {
      shellFor(ctx, shell);
    },
  });
  try {
    await fiber.await();
    const shellFibers = shells.map((name) =>
      fiber.ctx.plugin(NATIVE_SHELL_TOOLS[name], {
        enableRunInBackground: false,
        promoteOnTimeout: false,
      }),
    );
    for (const shellFiber of shellFibers) await shellFiber.await();
    if (shellFibers.some((shellFiber) => shellFiber.state !== ACTIVE_FIBER_STATE))
      throw new Error('Assignment Shell Tools failed to activate');
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
  return () => fiber.dispose();
}

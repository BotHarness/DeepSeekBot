import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ShellExecutor } from '@deepseek-ai/dsh-shell';
import type { DshAgentPresetHost } from '../runtime/dsh-bot-agent-adapter.js';
import { ACTIVE_FIBER_STATE } from '../runtime/cordis-fiber-state.js';
import { pluginShellTools, presetShells } from './orchestrator-file-tools.js';

export async function installAssignmentShell(
  agentCtx: Context,
  agent: Agent,
  presets: DshAgentPresetHost | undefined,
  shellFor: (ctx: Context, shell: ShellExecutor) => ShellExecutor,
): Promise<(() => Promise<void>) | undefined> {
  const shell = (presets?.serviceFor?.(agent, 'shell') ?? agentCtx.get('shell')) as
    | ShellExecutor
    | undefined;
  const shells = presetShells(agentCtx, agent);
  if (shell === undefined || shells.length === 0) return undefined;
  const fiber = agentCtx.isolate('shell').plugin({
    name: 'botharness-assignment-shell',
    apply(ctx: Context) {
      shellFor(ctx, shell);
    },
  });
  try {
    await fiber.await();
    const shellFibers = pluginShellTools(fiber.ctx, shells);
    for (const shellFiber of shellFibers) await shellFiber.await();
    if (shellFibers.some((shellFiber) => shellFiber.state !== ACTIVE_FIBER_STATE))
      throw new Error('Assignment Shell Tools failed to activate');
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
  return () => fiber.dispose();
}

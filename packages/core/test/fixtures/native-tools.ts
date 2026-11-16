import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, type ToolDefinition, type ToolGuard } from '@deepseek-ai/dsh-tools';
import {
  executeNativeTool,
  installNativeTools,
  type DirectNativeCall,
} from '../../src/runtime/native-agent-compat.js';

export async function executeFixtureNativeTool(
  input: DirectNativeCall,
  tools: readonly ToolDefinition[],
  guards: readonly ToolGuard[],
) {
  const native = new Context();
  const providers = native.plugin({
    name: 'fixture-native-tool-services',
    apply(ctx: Context) {
      ctx.provide('systemPrompt', {
        tools: () => () => undefined,
        section: () => () => undefined,
        getSectionOrder: () => 1,
      });
    },
  });
  const runtime = native.plugin(ToolRuntime, {});
  try {
    await providers.await();
    await runtime.await();
    for (const tool of tools) native.tools.register(tool);
    for (const guard of guards) native.tools.guard(guard);
    await native.inject(['tools'], (ctx) => installNativeTools(ctx)).await();
    return await executeNativeTool(native, input);
  } finally {
    await native.fiber.dispose();
  }
}

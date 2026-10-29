export const name = 'botharness-subagent-control';
export const inject = ['loader', 'tools', 'subagents', 'agents'];

export async function apply(ctx) {
  const control = await ctx.loader.import('@deepseek-ai/dsh-tool-subagent-control');
  await ctx.plugin(control);
  let listing;
  try {
    listing = await ctx.loader.import('@deepseek-ai/dsh-tool-subagent-control/list-agents');
  } catch (error) {
    if (
      error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' &&
      error.message.includes("'./list-agents'") &&
      /(?:dsh-)?tool-subagent-control[/\\]/u.test(error.message)
    )
      return;
    throw error;
  }
  await ctx.plugin(listing);
}

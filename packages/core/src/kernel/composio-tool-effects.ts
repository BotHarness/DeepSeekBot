export const COMPOSIO_EXECUTE_TOOL = 'mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL';

export function composioBatchSlugs(args: unknown): string[] | undefined {
  if (typeof args !== 'object' || args === null || !('tools' in args)) return undefined;
  const { tools } = args;
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const names: string[] = [];
  for (const item of tools) {
    const slug =
      typeof item === 'object' && item !== null && 'tool_slug' in item ? item.tool_slug : undefined;
    if (typeof slug !== 'string' || slug === '') return undefined;
    names.push(slug);
  }
  return names;
}

const SEND_VERBS = new Set(['SEND', 'FORWARD', 'INVITE', 'POST', 'PUBLISH', 'REPLY', 'SHARE']);

export function composioBatchSends(args: unknown): boolean {
  return (
    composioBatchSlugs(args)?.some((slug) =>
      slug
        .split('_')
        .slice(1)
        .some((word) => SEND_VERBS.has(word)),
    ) ?? false
  );
}

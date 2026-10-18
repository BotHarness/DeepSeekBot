import type { ChannelWorkspaceState, DockDirection } from './channel-dock-layout.js';

export const BOT_WORKSPACE_PANELS = [
  'memory-files',
  'memory-evolution',
  'schedules',
  'botharness-browser',
  'botharness-computer',
] as const;
export const CHANNEL_WORKSPACE_PANELS: readonly string[] = ['sessions', ...BOT_WORKSPACE_PANELS];

export const MESSAGE_LEAF = 'messages';
export const CHANNEL_LEAVES = [MESSAGE_LEAF, ...CHANNEL_WORKSPACE_PANELS];
export type ChannelSplit =
  | { readonly panel: string }
  | {
      readonly axis: 'horizontal' | 'vertical';
      readonly ratio: number;
      readonly first: ChannelSplit;
      readonly second: ChannelSplit;
    };

export function legacyChannelSplit(
  states: Readonly<Record<string, ChannelWorkspaceState>>,
): ChannelSplit {
  return CHANNEL_WORKSPACE_PANELS.reduceRight<ChannelSplit>(
    (content, id) => {
      const state = states[id];
      const direction = state?.direction ?? 'right';
      const leading = direction === 'left' || direction === 'above';
      const leaf = { panel: id };
      return {
        axis: direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical',
        ratio: leading ? (state?.ratio ?? 0.3) : 1 - (state?.ratio ?? 0.3),
        first: leading ? leaf : content,
        second: leading ? content : leaf,
      };
    },
    { panel: MESSAGE_LEAF },
  );
}

export function splitPanels(tree: ChannelSplit): string[] {
  return 'panel' in tree ? [tree.panel] : [...splitPanels(tree.first), ...splitPanels(tree.second)];
}

export function parseChannelSplit(value: unknown): ChannelSplit | undefined {
  const seen = new Set<string>();
  function visit(node: unknown, depth: number): ChannelSplit | undefined {
    if (!node || typeof node !== 'object' || depth > CHANNEL_LEAVES.length) return;
    if ('panel' in node) {
      if (
        typeof node.panel !== 'string' ||
        !CHANNEL_LEAVES.includes(node.panel) ||
        seen.has(node.panel)
      )
        return;
      seen.add(node.panel);
      return { panel: node.panel };
    }
    if (
      !('axis' in node) ||
      !['horizontal', 'vertical'].includes(String(node.axis)) ||
      !('ratio' in node) ||
      typeof node.ratio !== 'number' ||
      !Number.isFinite(node.ratio) ||
      !('first' in node) ||
      !('second' in node)
    )
      return;
    const first = visit(node.first, depth + 1),
      second = visit(node.second, depth + 1);
    if (!first || !second) return;
    return {
      axis: node.axis as 'horizontal' | 'vertical',
      ratio: Math.min(0.8, Math.max(0.2, node.ratio)),
      first,
      second,
    };
  }
  const tree = visit(value, 0);
  return tree && CHANNEL_LEAVES.every((id) => seen.has(id)) ? tree : undefined;
}

export function moveChannelSplit(
  tree: ChannelSplit,
  panel: string,
  target: string,
  direction: DockDirection,
): ChannelSplit {
  if (
    panel === target ||
    panel === MESSAGE_LEAF ||
    !splitPanels(tree).includes(panel) ||
    !splitPanels(tree).includes(target)
  )
    return tree;
  function remove(node: ChannelSplit): ChannelSplit | undefined {
    if ('panel' in node) return node.panel === panel ? undefined : node;
    const first = remove(node.first),
      second = remove(node.second);
    return first && second ? { ...node, first, second } : (first ?? second);
  }
  function insert(node: ChannelSplit): ChannelSplit {
    if ('panel' in node) {
      if (node.panel !== target) return node;
      const leading = direction === 'left' || direction === 'above';
      return {
        axis: direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical',
        ratio: 0.5,
        first: leading ? { panel } : node,
        second: leading ? node : { panel },
      };
    }
    return { ...node, first: insert(node.first), second: insert(node.second) };
  }
  return insert(remove(tree)!);
}

export function resizeChannelSplit(tree: ChannelSplit, path: string, ratio: number): ChannelSplit {
  if ('panel' in tree) return tree;
  if (!path) return { ...tree, ratio: Math.min(0.8, Math.max(0.2, ratio)) };
  const side = path[0] === '0' ? 'first' : 'second';
  return { ...tree, [side]: resizeChannelSplit(tree[side], path.slice(1), ratio) };
}

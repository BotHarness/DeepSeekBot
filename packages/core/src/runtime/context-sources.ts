import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { deriveEventMessage, type SessionEvent, type SessionSeq } from '@deepseek-ai/dsh-session';
import { estimateStructuralBlock } from '@deepseek-ai/dsh-token-meter/estimate';

export const CONTEXT_SOURCES = [
  'system',
  'tools',
  'human',
  'inbox-mention',
  'inbox-schedule',
  'inbox-memory',
  'inbox-assignment',
  'host',
  'skills',
  'attachments',
  'replies',
  'thinking',
  'tool-use',
  'summary',
  'other',
] as const;

export type ContextSource = (typeof CONTEXT_SOURCES)[number];

export interface ContextSourceRow {
  readonly source: ContextSource;
  readonly tokens: number;
  readonly tools?: readonly { readonly name: string; readonly tokens: number }[];
}

export interface ContextSourceSurface {
  readonly nodes: readonly { readonly seq: SessionSeq; readonly tokens: number }[];
  readonly totalTokens: number;
  eventAt(seq: SessionSeq): SessionEvent | undefined;
}

interface MessageLike {
  readonly content?: unknown;
  readonly source?: { readonly kind?: unknown; readonly callId?: unknown };
}

type Share = readonly [ContextSource, number, string?];

const INBOX_HEADER = '[Bot Inbox]';
const HOST_PREFIXES = ['[Host Assignment report transport]', '[Host reply transport reminder]'];

function messageOf(event: SessionEvent | undefined): MessageLike | undefined {
  if (event === undefined) return undefined;
  try {
    return (deriveEventMessage(event) as MessageLike | null) ?? undefined;
  } catch {
    return undefined;
  }
}

function blocksOf(message: MessageLike | undefined): ContentBlock[] {
  return Array.isArray(message?.content) ? (message.content as ContentBlock[]) : [];
}

function weight(block: ContentBlock): number {
  try {
    return Math.max(1, estimateStructuralBlock(block));
  } catch {
    return 1;
  }
}

function inboxLineSource(line: string): ContextSource {
  if (line.startsWith('- Bot Schedule ')) return 'inbox-schedule';
  if (line.startsWith('- Memory change ')) return 'inbox-memory';
  if (/ \(key [^)]*\) /.test(line) || line.includes('Host lifecycle notice'))
    return 'inbox-assignment';
  return 'inbox-mention';
}

function inboxShares(text: string): Share[] {
  const lines = text.split('\n');
  const items = lines.filter((line) => line.startsWith('- '));
  if (items.length === 0) return [['inbox-mention', text.length]];
  const header = text.length - items.reduce((sum, line) => sum + line.length + 1, 0);
  const shares: Share[] = items.map((line) => [inboxLineSource(line), line.length + 1]);
  const first = shares[0]!;
  return [[first[0], first[1] + Math.max(0, header)], ...shares.slice(1)];
}

function userShares(message: MessageLike): Share[] {
  const kind = message.source?.kind;
  const blocks = blocksOf(message);
  if (kind !== 'user') {
    const label: ContextSource =
      typeof kind !== 'string'
        ? 'other'
        : kind.startsWith('skill')
          ? 'skills'
          : /compact|summary/.test(kind)
            ? 'summary'
            : kind === 'runtime-context'
              ? 'host'
              : 'other';
    return blocks.map((block) => [label, weight(block)]);
  }
  return blocks.flatMap((block): Share[] => {
    if (block.type === 'image' || block.type === 'file') return [['attachments', weight(block)]];
    if (block.type !== 'text') return [['other', weight(block)]];
    const text = block.text;
    if (HOST_PREFIXES.some((prefix) => text.startsWith(prefix))) return [['host', weight(block)]];
    const at = text.indexOf(INBOX_HEADER);
    if (at < 0) return [['human', weight(block)]];
    const scale = weight(block) / Math.max(1, text.length);
    const before = text.slice(0, at).trimEnd();
    return [
      ...(before === '' ? [] : ([['human', before.length * scale]] as Share[])),
      ...inboxShares(text.slice(at)).map(([source, size]): Share => [source, size * scale]),
    ];
  });
}

function assistantShares(message: MessageLike, calls: Map<string, string>): Share[] {
  return blocksOf(message).map((block): Share => {
    if (block.type === 'reasoning') return ['thinking', weight(block)];
    if (block.type === 'tool-call') {
      calls.set(block.id, block.name);
      return ['tool-use', weight(block), block.name];
    }
    if (block.type === 'text') return ['replies', weight(block)];
    return ['other', weight(block)];
  });
}

function sharesOf(event: SessionEvent | undefined, calls: Map<string, string>): Share[] {
  if (event?.type === 'system/message') return [['system', 1]];
  if (event?.type === 'developer/message') return [['host', 1]];
  const message = messageOf(event);
  if (message === undefined) return [['other', 1]];
  if (event?.type === 'assistant/message') return assistantShares(message, calls);
  if (event?.type === 'tool/result') {
    const callId = message.source?.callId;
    const name = typeof callId === 'string' ? calls.get(callId) : undefined;
    return [['tool-use', 1, name ?? 'unknown']];
  }
  if (event?.type === 'user/message') return userShares(message);
  return [['other', 1]];
}

export function contextSources(surface: ContextSourceSurface): ContextSourceRow[] {
  const totals = new Map<ContextSource, number>();
  const tools = new Map<string, number>();
  const calls = new Map<string, string>();
  let surfaceTokens = 0;
  for (const node of surface.nodes) {
    surfaceTokens += node.tokens;
    const found = sharesOf(surface.eventAt(node.seq), calls);
    const shares: Share[] = found.length === 0 ? [['other', 1]] : found;
    const sum = shares.reduce((total, [, size]) => total + size, 0);
    if (sum <= 0) continue;
    for (const [source, size, tool] of shares) {
      const tokens = (node.tokens * size) / sum;
      totals.set(source, (totals.get(source) ?? 0) + tokens);
      if (tool !== undefined) tools.set(tool, (tools.get(tool) ?? 0) + tokens);
    }
  }
  const rest = surface.totalTokens - surfaceTokens;
  if (rest > 0) totals.set('tools', (totals.get('tools') ?? 0) + rest);
  const toolRows = [...tools]
    .map(([name, tokens]) => ({ name, tokens: Math.round(tokens) }))
    .filter((row) => row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
  return CONTEXT_SOURCES.flatMap((source): ContextSourceRow[] => {
    const tokens = Math.round(totals.get(source) ?? 0);
    if (tokens <= 0) return [];
    return [
      source === 'tool-use' && toolRows.length > 0
        ? { source, tokens, tools: toolRows }
        : { source, tokens },
    ];
  });
}

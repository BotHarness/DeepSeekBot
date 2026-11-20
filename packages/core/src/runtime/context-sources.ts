import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { deriveEventMessage, type SessionEvent, type SessionSeq } from '@deepseek-ai/dsh-session';
import { estimateStructuralBlock } from '@deepseek-ai/dsh-token-meter/estimate';

import { CONTEXT_SOURCES, type ContextSource } from './context-source-names.js';

export { CONTEXT_SOURCES, type ContextSource };

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

const INBOX_LIST_HEADER = '[Bot Inbox]';
const INBOX_PREFIX = '[Bot Inbox';
const OPEN_INBOX_PREFIX = '[Open Inbox]';
const HOST_PREFIXES = ['[Host ', '[Host:', '[Bot Inbox: Takeover Handoff ended]'];
const SOURCE_EVENT_LINE = /^Source Event ID: \S+$/u;

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

type Section = 'human' | 'inbox-list' | 'inbox-mention' | 'inbox-open' | 'host';

function sectionOf(line: string): Section | undefined {
  if (HOST_PREFIXES.some((prefix) => line.startsWith(prefix))) return 'host';
  if (line.startsWith(INBOX_LIST_HEADER)) return 'inbox-list';
  if (line.startsWith(OPEN_INBOX_PREFIX)) return 'inbox-open';
  if (line.startsWith(INBOX_PREFIX)) return 'inbox-mention';
  return undefined;
}

export function textShares(text: string): (readonly [ContextSource, number])[] {
  const lines = text.split('\n');
  const shares: [ContextSource, number][] = [];
  let section: Section = 'human';
  let carry = 0;
  let item: ContextSource | undefined;
  const add = (source: ContextSource, size: number): void => {
    const last = shares.at(-1);
    if (last?.[0] === source) last[1] += size;
    else shares.push([source, size]);
  };
  for (const [index, line] of lines.entries()) {
    const size = line.length + (index < lines.length - 1 ? 1 : 0);
    const next = sectionOf(line);
    if (next !== undefined) {
      section = next;
      item = undefined;
    } else if (SOURCE_EVENT_LINE.test(line) && sectionOf(lines[index + 1] ?? '') !== undefined) {
      carry += size;
      continue;
    }
    if (section === 'inbox-list') {
      if (line.startsWith('- ')) item = inboxLineSource(line);
      if (item === undefined) {
        carry += size;
        continue;
      }
      add(item, size + carry);
    } else add(section, size + carry);
    carry = 0;
  }
  if (carry > 0) add(section === 'inbox-list' ? 'inbox-mention' : section, carry);
  return shares.filter(([, size]) => size > 0);
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
    const shares = textShares(text);
    if (shares.length <= 1) return [[shares[0]?.[0] ?? 'human', weight(block)]];
    const scale = weight(block) / Math.max(1, text.length);
    return shares.map(([source, size]): Share => [source, size * scale]);
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

import type {
  SessionCollapseMode,
  SessionDetailLevel,
  SessionFoldedReplies,
} from '@botharness/host-client/shared/bot-mode-settings';

import type { SessionToolKind, SessionTranscriptItem, SessionTurnUsage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

type Item<K extends SessionTranscriptItem['kind']> = Extract<SessionTranscriptItem, { kind: K }>;

export type TranscriptStep = Item<'reasoning'> | Item<'tool'>;

export type TranscriptSegment =
  | { kind: 'reply'; key: string; item: Item<'reply'> }
  | { kind: 'process'; key: string; steps: TranscriptStep[] };

export type TranscriptBlock =
  | { kind: 'input'; key: string; item: Item<'input'> }
  | {
      kind: 'turn';
      key: string;
      number: number;
      startedAt: string;
      segments: TranscriptSegment[];
      end?: Item<'turn-end'>;
      live: boolean;
      last: boolean;
    };

export type ToolGroup = 'read' | 'edit' | 'execute' | 'search' | 'fetch' | 'other';

const NAMED_GROUPS: Record<string, ToolGroup> = {
  bash: 'execute',
  pwsh: 'execute',
  terminal_send: 'execute',
  run_code: 'execute',
  read: 'read',
  read_image: 'read',
  write: 'edit',
  edit: 'edit',
  apply_patch: 'edit',
  str_replace_editor: 'edit',
  grep: 'search',
  glob: 'search',
  web_search: 'fetch',
  web_fetch: 'fetch',
};

export function toolGroup(step: { tool: string; toolKind: SessionToolKind }): ToolGroup {
  if (step.toolKind === 'delete' || step.toolKind === 'move') return 'edit';
  if (step.toolKind !== 'other') return step.toolKind;
  return NAMED_GROUPS[step.tool] ?? 'other';
}

export function mergeLive(
  items: readonly SessionTranscriptItem[],
  live: readonly SessionTranscriptItem[],
): SessionTranscriptItem[] {
  if (live.length === 0) return [...items];
  const known = new Set(items.flatMap((item) => (item.kind === 'tool' ? [item.id] : [])));
  return [...items, ...live.filter((item) => item.kind !== 'tool' || !known.has(item.id))];
}

export function transcriptBlocks(
  items: readonly SessionTranscriptItem[],
  running: boolean,
): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let turn: Extract<TranscriptBlock, { kind: 'turn' }> | undefined;
  let startedAt: string | undefined;
  let number = 0;
  items.forEach((item, index) => {
    const key = `${item.kind}-${item.at}-${index}`;
    if (item.kind === 'input') {
      turn = undefined;
      startedAt = item.at;
      blocks.push({ kind: 'input', key, item });
      return;
    }
    if (turn === undefined) {
      number += 1;
      turn = {
        kind: 'turn',
        key,
        number,
        startedAt: startedAt ?? item.at,
        segments: [],
        live: false,
        last: false,
      };
      blocks.push(turn);
    }
    if (item.kind === 'turn-end') {
      turn.end = item;
      turn = undefined;
      startedAt = undefined;
      return;
    }
    if (item.kind === 'reply') {
      turn.segments.push({ kind: 'reply', key, item });
      return;
    }
    const last = turn.segments.at(-1);
    if (last?.kind === 'process') last.steps.push(item);
    else turn.segments.push({ kind: 'process', key, steps: [item] });
  });
  const turns = blocks.filter(
    (block): block is Extract<TranscriptBlock, { kind: 'turn' }> => block.kind === 'turn',
  );
  const lastTurn = turns.at(-1);
  if (lastTurn !== undefined && blocks.at(-1) === lastTurn) lastTurn.last = true;
  if (running && lastTurn !== undefined && lastTurn.last && lastTurn.end === undefined)
    lastTurn.live = true;
  return blocks;
}

export interface DetailDefaults {
  turnOpen: boolean;
  groupOpen: boolean;
  liveGroupOpen: boolean;
  reasoningOpen: boolean;
  preview: boolean;
}

export function detailDefaults(level: SessionDetailLevel): DetailDefaults {
  return {
    turnOpen: level === 'verbose',
    groupOpen: level === 'verbose',
    liveGroupOpen: level === 'detailed' || level === 'verbose',
    reasoningOpen: level === 'verbose',
    preview: level !== 'compact',
  };
}

export function turnFolds(
  block: Extract<TranscriptBlock, { kind: 'turn' }>,
  collapse: SessionCollapseMode,
): boolean {
  if (block.live || !block.segments.some((segment) => segment.kind === 'process')) return false;
  return collapse === 'completion' || !block.last;
}

export function foldedSegments(
  segments: readonly TranscriptSegment[],
  replies: SessionFoldedReplies,
): TranscriptSegment[] {
  const shown = segments.filter((segment) => segment.kind === 'reply');
  return replies === 'final' ? shown.slice(-1) : shown;
}

const GROUP_PRIORITY: Record<ToolGroup, number> = {
  execute: 0,
  edit: 0,
  read: 1,
  search: 1,
  fetch: 1,
  other: 2,
};

export function processSummary(steps: readonly TranscriptStep[], t: BotHarnessTranslate): string {
  const tools = steps.filter((step): step is Item<'tool'> => step.kind === 'tool');
  if (tools.length === 0) return t('sessions.detail.process.thought');
  const counts = new Map<ToolGroup, number>();
  for (const tool of tools) {
    const group = toolGroup(tool);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const ranked = [...counts].map(([group, count], index) => ({ group, count, index }));
  const shown = [...ranked]
    .sort((a, b) => GROUP_PRIORITY[a.group] - GROUP_PRIORITY[b.group] || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index);
  const text = shown
    .map(({ group, count }) => t(`sessions.detail.process.done.${group}`, { count }))
    .join(t('sessions.detail.process.comma'));
  return shown.length < ranked.length ? t('sessions.detail.process.more', { text }) : text;
}

export function liveLabel(step: TranscriptStep | undefined, t: BotHarnessTranslate): string {
  if (step === undefined || step.kind === 'reasoning')
    return t('sessions.detail.process.live.thinking');
  return t(`sessions.detail.process.live.${toolGroup(step)}`);
}

export function stepFailed(step: TranscriptStep): boolean {
  return step.kind === 'tool' && (step.status === 'failed' || step.status === 'denied');
}

export function stepTarget(step: Item<'tool'>): string | undefined {
  return step.command ?? step.path ?? step.url ?? step.detail;
}

export function durationText(ms: number, t: BotHarnessTranslate): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60
    ? t('sessions.detail.duration.seconds', { seconds })
    : t('sessions.detail.duration.minutes', {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60,
      });
}

export function elapsedText(from: string, to: string, t: BotHarnessTranslate): string | undefined {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return durationText(ms, t);
}

export function compactCount(count: number): string {
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function usageText(usage: SessionTurnUsage, t: BotHarnessTranslate): string {
  const tokens = t('sessions.detail.usage.tokens', { count: compactCount(usage.tokens) });
  if (usage.outputMs <= 0 || usage.output <= 0) return tokens;
  const tps = Math.round((usage.output / usage.outputMs) * 1000);
  return `${tokens} · ${t('sessions.detail.usage.speed', { tps })}`;
}

export function clockText(at: string): string {
  const time = new Date(at);
  if (Number.isNaN(time.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(time);
}

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export function changedFiles(segments: readonly TranscriptSegment[]): ChangedFile[] {
  const files = new Map<string, ChangedFile>();
  for (const segment of segments) {
    if (segment.kind !== 'process') continue;
    for (const step of segment.steps) {
      if (step.kind !== 'tool' || step.status !== 'done' || step.path === undefined) continue;
      if (toolGroup(step) !== 'edit') continue;
      const file = files.get(step.path) ?? { path: step.path, added: 0, removed: 0 };
      file.added += step.added ?? 0;
      file.removed += step.removed ?? 0;
      files.set(step.path, file);
    }
  }
  return [...files.values()];
}

export type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string };

export function diffLines(oldText: string | null, newText: string): DiffLine[] {
  const before = oldText === null || oldText === '' ? [] : oldText.split('\n');
  const after = newText === '' ? [] : newText.split('\n');
  if (before.length * after.length > 250_000)
    return [
      ...before.map((text) => ({ kind: 'remove' as const, text })),
      ...after.map((text) => ({ kind: 'add' as const, text })),
    ];
  const table = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1)
    for (let j = after.length - 1; j >= 0; j -= 1)
      table[i]![j] =
        before[i] === after[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      lines.push({ kind: 'same', text: before[i]! });
      i += 1;
      j += 1;
    } else if (
      j < after.length &&
      (i === before.length || table[i]![j + 1]! >= table[i + 1]![j]!)
    ) {
      lines.push({ kind: 'add', text: after[j]! });
      j += 1;
    } else {
      lines.push({ kind: 'remove', text: before[i]! });
      i += 1;
    }
  }
  return lines;
}

export function previewLines(text: string, count = 4): string {
  return text.trim().split('\n').slice(-count).join('\n');
}

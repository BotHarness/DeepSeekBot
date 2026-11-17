import type { SessionToolKind, SessionTranscriptItem } from './bridge.js';
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
      startedAt: string;
      segments: TranscriptSegment[];
      end?: Item<'turn-end'>;
      live: boolean;
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

export function transcriptBlocks(
  items: readonly SessionTranscriptItem[],
  running: boolean,
): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let turn: Extract<TranscriptBlock, { kind: 'turn' }> | undefined;
  let startedAt: string | undefined;
  items.forEach((item, index) => {
    const key = `${item.kind}-${item.at}-${index}`;
    if (item.kind === 'input') {
      turn = undefined;
      startedAt = item.at;
      blocks.push({ kind: 'input', key, item });
      return;
    }
    if (turn === undefined) {
      turn = {
        kind: 'turn',
        key,
        startedAt: startedAt ?? item.at,
        segments: [],
        live: false,
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
  const last = blocks.at(-1);
  if (running && last?.kind === 'turn' && last.end === undefined) last.live = true;
  return blocks;
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

export function elapsedText(from: string, to: string, t: BotHarnessTranslate): string | undefined {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60
    ? t('sessions.detail.duration.seconds', { seconds })
    : t('sessions.detail.duration.minutes', {
        minutes: Math.floor(seconds / 60),
        seconds: seconds % 60,
      });
}

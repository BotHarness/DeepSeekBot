import { dmChannel, type ProfileBotRef } from './bot-profile';
import type { HostClient } from './client';

export type MemoryChangeStatus = 'accepted' | 'pending' | 'needs-repair';

export interface MemoryChange {
  sha: string;
  subject: string;
  authoredAt: string;
  status: MemoryChangeStatus;
}

export interface MemoryChangesPage {
  commits: MemoryChange[];
  hasMore: boolean;
}

export type MemoryFileChangeKind = 'added' | 'modified' | 'deleted';

export type MemoryDiffMark = readonly [start: number, end: number];

export type MemoryDiffRow =
  | { kind: 'hunk'; header: string }
  | {
      kind: 'line';
      change: 'context' | 'add' | 'remove';
      oldLine: number | null;
      newLine: number | null;
      text: string;
      marks: MemoryDiffMark[];
    };

export interface MemoryCommitFile {
  path: string;
  kind: MemoryFileChangeKind;
  rows: MemoryDiffRow[];
  added: number;
  removed: number;
  binary: boolean;
}

export interface MemoryCommit {
  sha: string;
  subject: string;
  files: MemoryCommitFile[];
}

export async function loadMemoryChanges(
  client: HostClient,
  bot: ProfileBotRef,
  offset = 0,
): Promise<MemoryChangesPage> {
  const channelId = await dmChannel(client, bot);
  const graph = await client.call<{ commits: MemoryChange[]; hasMore: boolean }>('memoryGitGraph', {
    channelId,
    offset,
  });
  return {
    commits: graph.commits.map(({ sha, subject, authoredAt, status }) => ({
      sha,
      subject,
      authoredAt,
      status,
    })),
    hasMore: graph.hasMore,
  };
}

type DiffSection = { rows: MemoryDiffRow[]; added: number; removed: number; binary: boolean };
type DiffLine = Extract<MemoryDiffRow, { kind: 'line' }>;

const WORD_LIMIT = 40_000;
const WORD_SHARED = 0.5;

function words(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

function changedRanges(tokens: string[], keep: boolean[]): MemoryDiffMark[] {
  const marks: [number, number][] = [];
  let offset = 0;
  tokens.forEach((token, index) => {
    const end = offset + token.length;
    if (!keep[index]) {
      const last = marks.at(-1);
      if (last !== undefined && last[1] === offset) last[1] = end;
      else marks.push([offset, end]);
    }
    offset = end;
  });
  return marks;
}

export function wordMarks(before: string, after: string): [MemoryDiffMark[], MemoryDiffMark[]] {
  const left = words(before);
  const right = words(after);
  if (left.length * right.length > WORD_LIMIT) return [[], []];
  const table = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1)
    for (let j = right.length - 1; j >= 0; j -= 1)
      table[i]![j] =
        left[i] === right[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const keepLeft = left.map(() => false);
  const keepRight = right.map(() => false);
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      keepLeft[i] = true;
      keepRight[j] = true;
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
    else j += 1;
  }
  const kept = (tokens: string[], keep: boolean[]) => {
    const total = tokens.join('').trim().length;
    const same = tokens
      .filter((token, index) => keep[index])
      .join('')
      .trim().length;
    return total === 0 ? 1 : same / total;
  };
  if (Math.min(kept(left, keepLeft), kept(right, keepRight)) < WORD_SHARED) return [[], []];
  return [changedRanges(left, keepLeft), changedRanges(right, keepRight)];
}

function pairChanges(rows: MemoryDiffRow[]) {
  let index = 0;
  while (index < rows.length) {
    const removed: DiffLine[] = [];
    while (rows[index]?.kind === 'line' && (rows[index] as DiffLine).change === 'remove')
      removed.push(rows[index++] as DiffLine);
    const added: DiffLine[] = [];
    while (rows[index]?.kind === 'line' && (rows[index] as DiffLine).change === 'add')
      added.push(rows[index++] as DiffLine);
    removed.slice(0, added.length).forEach((line, pair) => {
      const [before, after] = wordMarks(line.text, added[pair]!.text);
      line.marks = before;
      added[pair]!.marks = after;
    });
    if (removed.length === 0 && added.length === 0) index += 1;
  }
}

function unquote(path: string): string {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

export function splitUnifiedDiff(diff: string): Map<string, DiffSection> {
  const sections = new Map<string, DiffSection>();
  let current: DiffSection | undefined;
  let header = '';
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  const start = (path: string) => {
    current = sections.get(path) ?? { rows: [], added: 0, removed: 0, binary: false };
    sections.set(path, current);
  };
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/u.exec(line);
      header = match?.[2] ?? '';
      current = undefined;
      inHunk = false;
      if (header !== '') start(header);
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      const target = unquote(line.slice(4));
      if (target.startsWith('b/') && target.slice(2) !== header) start(target.slice(2));
      continue;
    }
    if (!inHunk && (line.startsWith('--- ') || line.startsWith('index '))) continue;
    if (line.startsWith('Binary files ') && current !== undefined) {
      current.binary = true;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk !== null) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current?.rows.push({ kind: 'hunk', header: line });
      continue;
    }
    if (!inHunk || current === undefined) continue;
    if (line.startsWith('+')) {
      current.rows.push({
        kind: 'line',
        change: 'add',
        oldLine: null,
        newLine: newLine++,
        text: line.slice(1),
        marks: [],
      });
      current.added += 1;
    } else if (line.startsWith('-')) {
      current.rows.push({
        kind: 'line',
        change: 'remove',
        oldLine: oldLine++,
        newLine: null,
        text: line.slice(1),
        marks: [],
      });
      current.removed += 1;
    } else if (line.startsWith(' '))
      current.rows.push({
        kind: 'line',
        change: 'context',
        oldLine: oldLine++,
        newLine: newLine++,
        text: line.slice(1),
        marks: [],
      });
  }
  for (const section of sections.values()) pairChanges(section.rows);
  return sections;
}

function changeKind(status: string): MemoryFileChangeKind {
  return status.startsWith('A') ? 'added' : status.startsWith('D') ? 'deleted' : 'modified';
}

export async function loadMemoryCommit(
  client: HostClient,
  bot: ProfileBotRef,
  sha: string,
): Promise<MemoryCommit> {
  const channelId = await dmChannel(client, bot);
  const commit = await client.call<{
    sha: string;
    subject: string;
    files: { path: string; status: string }[];
    diff: string;
  }>('memoryGitCommitDiff', { channelId, sha });
  const sections = splitUnifiedDiff(commit.diff);
  return {
    sha: commit.sha,
    subject: commit.subject,
    files: commit.files.map((file) => {
      const section = sections.get(file.path);
      return {
        path: file.path,
        kind: changeKind(file.status),
        rows: section?.rows ?? [],
        added: section?.added ?? 0,
        removed: section?.removed ?? 0,
        binary: section?.binary ?? false,
      };
    }),
  };
}

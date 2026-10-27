import type {
  ApprovalDiffLine,
  ApprovalFileChange,
} from '../../../../packages/client/src/client/approval-diff';
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

export interface MemoryCommitFile extends ApprovalFileChange {
  kind: MemoryFileChangeKind;
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

type DiffSection = { lines: ApprovalDiffLine[]; added: number; removed: number; binary: boolean };

function unquote(path: string): string {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

export function splitUnifiedDiff(diff: string): Map<string, DiffSection> {
  const sections = new Map<string, DiffSection>();
  let current: DiffSection | undefined;
  let header = '';
  let inHunk = false;
  const start = (path: string) => {
    current = sections.get(path) ?? { lines: [], added: 0, removed: 0, binary: false };
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
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk || current === undefined) continue;
    if (line.startsWith('+')) {
      current.lines.push({ kind: 'add', text: line.slice(1) });
      current.added += 1;
    } else if (line.startsWith('-')) {
      current.lines.push({ kind: 'remove', text: line.slice(1) });
      current.removed += 1;
    } else if (line.startsWith(' ')) current.lines.push({ kind: 'context', text: line.slice(1) });
  }
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
        lines: section?.lines ?? [],
        added: section?.added ?? 0,
        removed: section?.removed ?? 0,
        binary: section?.binary ?? false,
      };
    }),
  };
}

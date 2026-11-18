import { HostAnswerInvalid, record, text, type HostCall } from './host-answer';

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryVersionName {
  tag: string;
  name: string;
}

export type MemoryGitCommitStatus = 'accepted' | 'pending' | 'needs-repair';

export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  versions?: MemoryVersionName[];
  status: MemoryGitCommitStatus;
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export type MemoryPreviewStatus = 'ready' | 'missing' | 'unsupported' | 'too-large' | 'stale';

export interface MemoryImage {
  mime?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';
  source: string;
  status: MemoryPreviewStatus;
  revision?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface MemoryImageComparison {
  before?: MemoryImage;
  after?: MemoryImage;
}

export interface MemoryMarkdown {
  source: string;
  status: MemoryPreviewStatus;
  revision?: string;
  body: string;
}

export interface MemoryMarkdownComparison {
  before?: MemoryMarkdown;
  after?: MemoryMarkdown;
}

export interface MemoryGitCommitDiff {
  sha: string;
  subject?: string;
  files: {
    path: string;
    status: string;
    images?: MemoryImageComparison;
    markdown?: MemoryMarkdownComparison;
  }[];
  diff: string;
}

export interface MemoryStandingUsage {
  path: string;
  role: 'soul' | 'coreMemory';
  chars: number;
  limit: number;
}

export interface MemorySnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
  standing: MemoryStandingUsage[];
}

export interface MemoryFile {
  path: string;
  body: string;
  head: string;
  binary?: boolean;
  image?: MemoryImage;
  markdown?: MemoryMarkdown;
}

const ACTORS = ['agent', 'human', 'system'] as const;
const CAUSES = ['source-event', 'human-edit', 'repository-init'] as const;
const STATUSES = ['accepted', 'pending', 'needs-repair'] as const;

function oneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}

function texts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

export function parseVersionNames(value: unknown): MemoryVersionName[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const version = record(item);
    return text(version?.['tag']) && text(version['name'])
      ? [{ tag: version['tag'], name: version['name'] }]
      : [];
  });
}

export function parseMemoryCommit(value: unknown): MemoryAcceptedCommit {
  const row = record(value);
  if (
    !text(row?.['botSlug']) ||
    !text(row['sha']) ||
    !(row['parentSha'] === null || text(row['parentSha'])) ||
    !oneOf(ACTORS, row['actorKind']) ||
    !text(row['actorId']) ||
    !oneOf(CAUSES, row['causeKind']) ||
    !text(row['causeId']) ||
    !text(row['validationResult']) ||
    !text(row['acceptedAt'])
  )
    throw new HostAnswerInvalid('The computer returned an unreadable Memory commit.');
  return {
    botSlug: row['botSlug'],
    sha: row['sha'],
    parentSha: row['parentSha'],
    actorKind: row['actorKind'],
    actorId: row['actorId'],
    causeKind: row['causeKind'],
    causeId: row['causeId'],
    validationResult: row['validationResult'],
    acceptedAt: row['acceptedAt'],
  };
}

function standing(value: unknown): MemoryStandingUsage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): MemoryStandingUsage[] => {
    const row = record(entry);
    if (
      !text(row?.['path']) ||
      (row['role'] !== 'soul' && row['role'] !== 'coreMemory') ||
      typeof row['chars'] !== 'number' ||
      typeof row['limit'] !== 'number'
    )
      return [];
    return [
      {
        path: row['path'],
        role: row['role'],
        chars: row['chars'],
        limit: row['limit'],
      },
    ];
  });
}

export async function loadMemorySnapshot(
  host: HostCall,
  channelId: string,
): Promise<MemorySnapshot> {
  const snapshot = record(record(await host.call('memorySnapshot', { channelId }))?.['snapshot']);
  if (
    snapshot === undefined ||
    !(snapshot['head'] === null || text(snapshot['head'])) ||
    !texts(snapshot['files']) ||
    typeof snapshot['provisional'] !== 'boolean'
  )
    throw new HostAnswerInvalid('memorySnapshot returned an unreadable snapshot.');
  return {
    head: snapshot['head'],
    files: snapshot['files'],
    provisional: snapshot['provisional'],
    standing: standing(snapshot['standing']),
  };
}

export async function loadMemoryFile(
  host: HostCall,
  channelId: string,
  path: string,
): Promise<MemoryFile | undefined> {
  const answer = record(await host.call('memoryFile', { channelId, path }));
  if (answer?.['file'] === undefined) return undefined;
  const file = record(answer['file']);
  if (
    !text(file?.['path']) ||
    !text(file['body']) ||
    !text(file['head']) ||
    (file['binary'] !== undefined && typeof file['binary'] !== 'boolean')
  )
    throw new HostAnswerInvalid('memoryFile returned an unreadable file.');
  return file as unknown as MemoryFile;
}

function gitCommit(value: unknown): MemoryGitCommit {
  const commit = record(value);
  if (
    !text(commit?.['sha']) ||
    !texts(commit['parents']) ||
    !text(commit['subject']) ||
    !text(commit['authoredAt']) ||
    !texts(commit['branches']) ||
    !oneOf(STATUSES, commit['status'])
  )
    throw new HostAnswerInvalid('memoryGitGraph returned an unreadable commit.');
  return {
    sha: commit['sha'],
    parents: commit['parents'],
    subject: commit['subject'],
    authoredAt: commit['authoredAt'],
    branches: commit['branches'],
    versions: parseVersionNames(commit['versions']),
    status: commit['status'],
  };
}

export async function loadMemoryGitGraph(
  host: HostCall,
  channelId: string,
  offset: number,
  path?: string,
): Promise<MemoryGitGraph> {
  const graph = record(
    await host.call('memoryGitGraph', {
      channelId,
      offset,
      ...(path === undefined ? {} : { path }),
    }),
  );
  if (
    !text(graph?.['head']) ||
    !(graph['currentBranch'] === null || text(graph['currentBranch'])) ||
    !texts(graph['branches']) ||
    typeof graph['dirty'] !== 'boolean' ||
    typeof graph['hasMore'] !== 'boolean' ||
    !Array.isArray(graph['commits'])
  )
    throw new HostAnswerInvalid('memoryGitGraph returned an unreadable history.');
  return {
    head: graph['head'],
    currentBranch: graph['currentBranch'],
    branches: graph['branches'],
    dirty: graph['dirty'],
    commits: graph['commits'].map(gitCommit),
    hasMore: graph['hasMore'],
  };
}

export async function loadMemoryGitCommitDiff(
  host: HostCall,
  channelId: string,
  sha: string,
): Promise<MemoryGitCommitDiff> {
  const answer = record(await host.call('memoryGitCommitDiff', { channelId, sha }));
  if (
    answer?.['sha'] !== sha ||
    !text(answer['diff']) ||
    (answer['subject'] !== undefined && !text(answer['subject'])) ||
    !Array.isArray(answer['files']) ||
    !answer['files'].every((value) => {
      const file = record(value);
      return text(file?.['path']) && text(file['status']);
    })
  )
    throw new HostAnswerInvalid('memoryGitCommitDiff returned an unreadable change.');
  return answer as unknown as MemoryGitCommitDiff;
}

export async function saveMemoryFile(
  host: HostCall,
  input: {
    channelId: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  },
): Promise<MemoryAcceptedCommit> {
  return parseMemoryCommit(record(await host.call('memorySave', { ...input }))?.['commit']);
}
